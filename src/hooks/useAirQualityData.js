import { startTransition, useCallback, useMemo, useEffect, useRef, useState } from 'react';
import {
  buildEventOptions,
  FALLBACK_DASHBOARD_DATA,
  fetchAirQualityData,
  fetchEventDetail,
  fetchRecentEvents,
  mapEventDetail,
  mapLiveDashboard,
  mapRecentEvents,
  postCleanAcknowledgement,
} from '../lib/airQuality';

const POLL_INTERVAL_MS = 5000;
const RECENT_EVENT_LIMIT = 20;

function selectDefaultEventId(liveDashboard, eventsData, previousEventId) {
  const options = buildEventOptions(liveDashboard.currentSession, eventsData.recentEvents);

  if (previousEventId && options.some((event) => event.id === previousEventId)) {
    return previousEventId;
  }

  return liveDashboard.currentSession?.id || options[0]?.id || null;
}

export default function useAirQualityData() {
  const [liveDashboard, setLiveDashboard] = useState(mapLiveDashboard(FALLBACK_DASHBOARD_DATA));
  const [eventsData, setEventsData] = useState(mapRecentEvents(null));
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [selectedEventDetail, setSelectedEventDetail] = useState(null);
  const [cleanActionState, setCleanActionState] = useState('idle');
  const [dashboardRequestState, setDashboardRequestState] = useState('loading');
  const [detailRequestState, setDetailRequestState] = useState('idle');
  const refreshDashboardRef = useRef(async () => {});
  const detailRefreshKey = selectedEventId && selectedEventId === liveDashboard.currentSession?.id
    ? liveDashboard.lastMessageAt
    : selectedEventId;

  useEffect(() => {
    let isMounted = true;
    let dashboardController = null;

    const loadDashboard = async () => {
      dashboardController?.abort();
      dashboardController = new AbortController();
      setDashboardRequestState((previousState) => (
        previousState === 'loading' ? 'loading' : 'refreshing'
      ));

      try {
        const [dashboardResponse, eventsResponse] = await Promise.all([
          fetchAirQualityData(dashboardController.signal),
          fetchRecentEvents(dashboardController.signal, RECENT_EVENT_LIMIT),
        ]);

        if (!isMounted) {
          return;
        }

        const nextLiveDashboard = mapLiveDashboard(dashboardResponse);
        const nextEventsData = mapRecentEvents(eventsResponse);

        startTransition(() => {
          setLiveDashboard(nextLiveDashboard);
          setEventsData(nextEventsData);
          setSelectedEventId((previousEventId) => selectDefaultEventId(
            nextLiveDashboard,
            nextEventsData,
            previousEventId,
          ));
          setDashboardRequestState('idle');
        });
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Failed to load dashboard data:', error);
          setDashboardRequestState('idle');
        }
      }
    };

    refreshDashboardRef.current = loadDashboard;
    loadDashboard();
    const intervalId = window.setInterval(loadDashboard, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      dashboardController?.abort();
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!selectedEventId) {
      setSelectedEventDetail(null);
      setDetailRequestState('idle');
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    const loadDetail = async () => {
      setDetailRequestState('refreshing');
      try {
        const detailResponse = await fetchEventDetail(selectedEventId, controller.signal);

        if (isMounted) {
          startTransition(() => {
            setSelectedEventDetail(mapEventDetail(detailResponse));
            setDetailRequestState('idle');
          });
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Failed to load event detail:', error);
          setDetailRequestState('idle');
        }
      }
    };

    loadDetail();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [selectedEventId, detailRefreshKey]);

  const eventOptions = buildEventOptions(liveDashboard.currentSession, eventsData.recentEvents);
  const selectedEventIndex = eventOptions.findIndex((event) => event.id === selectedEventId);
  const selectedEventSummary = selectedEventIndex >= 0 ? eventOptions[selectedEventIndex] : null;

  const selectPreviousEvent = useCallback(() => {
    if (selectedEventIndex > 0) {
      setSelectedEventId(eventOptions[selectedEventIndex - 1].id);
    }
  }, [eventOptions, selectedEventIndex]);

  const selectNextEvent = useCallback(() => {
    if (selectedEventIndex >= 0 && selectedEventIndex < eventOptions.length - 1) {
      setSelectedEventId(eventOptions[selectedEventIndex + 1].id);
    }
  }, [eventOptions, selectedEventIndex]);

  const acknowledgeClean = useCallback(async () => {
    if (cleanActionState === 'pending') {
      return false;
    }

    try {
      setCleanActionState('pending');
      await postCleanAcknowledgement();
      await refreshDashboardRef.current();
      setCleanActionState('success');

      window.setTimeout(() => {
        setCleanActionState('idle');
      }, 800);

      return true;
    } catch (error) {
      console.error('Failed to acknowledge clean action:', error);
      setCleanActionState('error');
      window.setTimeout(() => {
        setCleanActionState('idle');
      }, 1200);
      return false;
    }
  }, [cleanActionState]);

  const durationCard = useMemo(() => ({
      connected: liveDashboard.connected,
      latestVoc: liveDashboard.latestVoc,
      latestLabel: liveDashboard.latestLabel,
      totalEventDurationMs: liveDashboard.eventSummary.totalEventDurationMs,
      totalEventCount: liveDashboard.eventSummary.totalEventCount,
      points: liveDashboard.points,
      dayMarkers: liveDashboard.dayMarkers,
      isPending: dashboardRequestState !== 'idle',
    }), [
      dashboardRequestState,
      liveDashboard.connected,
      liveDashboard.dayMarkers,
      liveDashboard.eventSummary.totalEventCount,
      liveDashboard.eventSummary.totalEventDurationMs,
      liveDashboard.latestLabel,
      liveDashboard.latestVoc,
      liveDashboard.points,
    ]);

  const avgCard = useMemo(() => ({
      selectedEvent: selectedEventDetail || selectedEventSummary,
      hasEvents: eventOptions.length > 0,
      canGoPrevious: selectedEventIndex > 0,
      canGoNext: selectedEventIndex >= 0 && selectedEventIndex < eventOptions.length - 1,
      onPrevious: selectPreviousEvent,
      onNext: selectNextEvent,
      isPending: detailRequestState === 'refreshing',
    }), [
      detailRequestState,
      eventOptions.length,
      selectNextEvent,
      selectPreviousEvent,
      selectedEventDetail,
      selectedEventIndex,
      selectedEventSummary,
    ]);

  const cleanCard = useMemo(() => ({
      cleanState: liveDashboard.cleanState,
      isPending: cleanActionState === 'pending',
      actionState: cleanActionState,
      onAcknowledgeClean: acknowledgeClean,
    }), [
      acknowledgeClean,
      cleanActionState,
      liveDashboard.cleanState,
    ]);

  return useMemo(() => ({
    durationCard,
    avgCard,
    cleanCard,
  }), [avgCard, cleanCard, durationCard]);
}
