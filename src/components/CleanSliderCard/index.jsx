import { useRef, useState } from 'react';
import { GlassCard } from '@developer-hub/liquid-glass';
import styles from './styles.module.css';

const SUCCESS_THRESHOLD = 0.88;
const THUMB_WIDTH = 84;
const THUMB_HALF_WIDTH = THUMB_WIDTH / 2;

export default function CleanSliderCard({ data }) {
  const sliderRef = useRef(null);
  const [thumbOffset, setThumbOffset] = useState(0);
  const [dragState, setDragState] = useState(null);

  const handlePointerDown = (event) => {
    if (data.isPending || !sliderRef.current) {
      return;
    }

    const bounds = sliderRef.current.getBoundingClientRect();
    const maxOffset = Math.max(0, bounds.width - THUMB_WIDTH);

    setDragState({
      pointerId: event.pointerId,
      boundsLeft: bounds.left,
      maxOffset,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!dragState) {
      return;
    }

    const nextOffset = Math.max(
      0,
      Math.min(
        dragState.maxOffset,
        event.clientX - dragState.boundsLeft - THUMB_HALF_WIDTH,
      ),
    );
    setThumbOffset(nextOffset);
  };

  const handlePointerUp = async (event) => {
    if (!dragState) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(dragState.pointerId)) {
      event.currentTarget.releasePointerCapture(dragState.pointerId);
    }

    const progress = dragState.maxOffset === 0 ? 0 : thumbOffset / dragState.maxOffset;
    setDragState(null);

    if (progress >= SUCCESS_THRESHOLD) {
      setThumbOffset(dragState.maxOffset);
      const succeeded = await data.onAcknowledgeClean();
      if (succeeded) {
        window.setTimeout(() => {
          setThumbOffset(0);
        }, 400);
      } else {
        setThumbOffset(0);
      }
      return;
    }

    setThumbOffset(0);
  };

  return (
    <GlassCard blurAmount={0.08} cornerRadius={20} className={styles.slideCard}>
      <div className={styles.content} data-node-id="85:87">
        <div className={styles.header} data-node-id="85:88">
          <div className={styles.question} data-node-id="85:89">Clean?</div>
          <div
            className={styles.status}
            data-node-id="85:90"
            data-status={data.cleanState.cleanStatus}
          >
            {data.cleanState.cleanStatus}
          </div>
        </div>

        <div className={styles.sliderShell}>
          <div
            ref={sliderRef}
            className={styles.slider}
            data-node-id="85:105"
            data-pending={data.isPending}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div className={styles.track} data-node-id="89:146">
              <span className={styles.trackLabel} data-node-id="85:107">
                {data.isPending ? 'Cleaning...' : 'Slide to clean >'}
              </span>
            </div>
            <div
              className={`${styles.thumb} ${dragState ? styles.thumbDragging : ''}`}
              data-node-id="85:108"
              style={{ transform: `translate(${thumbOffset}px, -50%)` }}
            />
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
