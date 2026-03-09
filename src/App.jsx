import { memo } from 'react';
import GradientBg from "./GradientBg";
import styles from './App.module.css';
import useAirQualityData from './hooks/useAirQualityData';

// Components
import DurationCard from './components/DurationCard';
import AvgCard from './components/AvgCard';
import CleanSliderCard from './components/CleanSliderCard';
import BottomBar from './components/BottomBar';

const StaticGradientBg = memo(GradientBg);
const StaticBottomBar = memo(BottomBar);

function App() {
  const dashboardData = useAirQualityData();

  return (
    <div className={styles.appContainer}>
      <div className={styles.backgroundLayer}>
        <StaticGradientBg />
      </div>

      <div className={styles.dashboardLayer}>
        <div className={styles.mainFrame}>
          <div className={styles.gridContainer}>
            <div className={styles.topRow}>
              <DurationCard data={dashboardData.durationCard} />
            </div>

            <div className={styles.bottomRow}>
              <AvgCard data={dashboardData.avgCard} />
              <CleanSliderCard data={dashboardData.cleanCard} />
            </div>
          </div>
        </div>
      </div>
      
      <div className={styles.bottomBar}>
        <StaticBottomBar />
      </div>

    </div>
  )
}

export default App
