import { useEffect, useState } from 'react';
import { GlassCard } from '@developer-hub/liquid-glass';
import logoIcon from '../../assets/Logo.svg';
import styles from './styles.module.css';

export default function BottomBar() {
  const [isIntroOpen, setIsIntroOpen] = useState(false);

  useEffect(() => {
    if (!isIntroOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsIntroOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isIntroOpen]);

  return (
    <div className="relative w-full">
      {isIntroOpen ? (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onClick={() => setIsIntroOpen(false)}
        >
          <GlassCard blurAmount={0.16} cornerRadius={28} className={styles.modalGlass}>
            <section
              className={styles.modalSurface}
              role="dialog"
              aria-modal="true"
              aria-labelledby="project-intro-title"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                className={styles.closeButton}
                type="button"
                aria-label="Close project introduction"
                onClick={() => setIsIntroOpen(false)}
              >
                <span aria-hidden="true">×</span>
              </button>

              <div className={styles.modalContent}>
                <h2 id="project-intro-title" className={styles.modalTitle}>
                  Project Intro
                </h2>

                <p className={styles.modalParagraph}>
                  This project tracks cooking events in my apartment using VOC levels.
                  VOC indicates how much cooking fume is generated, which over time
                  leads to grease buildup in the room.
                </p>

                <ul className={styles.modalList}>
                  <li>The top chart shows VOC data for the whole day.</li>
                  <li>The bottom-left chart shows VOC data for each cooking event.</li>
                  <li>
                    The bottom-right card reminds me when it is time to clean the room.
                  </li>
                </ul>

                <p className={styles.modalLinkRow}>
                  <span>Project Repo:</span>{' '}
                  <a
                    className={styles.modalLink}
                    href="https://github.com/Mr-speakless/ConnectedDevicesNetwork-TheMist"
                    target="_blank"
                    rel="noreferrer"
                  >
                    ConnectedDevicesNetwork-TheMist
                  </a>
                </p>

                <p className={styles.modalLinkRow}>
                  <span>Project Process:</span>{' '}
                  <a
                    className={styles.modalLink}
                    href="https://www.notion.so/Dashboard-Project-The-Mist-3024eff2790180268560dffff661f8c4?source=copy_link"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Notion_Lucas
                  </a>
                </p>

                <p className={styles.modalParagraph}>
                  Thanks to Thomas Igoe for his coaching.
                </p>

                <p className={styles.modalFooter}>
                  Connected Devices and Networked Interaction
                  <br />
                  ITPG-GT 2565
                </p>
              </div>
            </section>
          </GlassCard>
        </div>
      ) : null}

      <GlassCard blurAmount={0.08} cornerRadius={20} className={styles.barGlass}>
        {/* let the div blow to be full of it's father div */}
        <div className="flex w-full items-center rounded-[20px] bg-[rgba(255,255,255,0.22)] px-[10px] py-[10px]" data-node-id="85:34">
          <div className="flex w-auto items-center justify-start max-[720px]:w-[44px]">
            <div className="flex items-center" data-node-id="85:35">
              <img
                className="block ml-1 h-12 w-12 object-contain"
                src={logoIcon}
                alt="TheMist logo"
                data-node-id="85:37"
              />
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center px-2" data-node-id="85:40">
            <h1
              className="m-0 whitespace-nowrap text-[clamp(1.5rem,2.6vw,2.5rem)] leading-none font-normal text-[rgba(255,255,255,0.92)] [font-family:var(--font-display)] max-[720px]:text-[1.35rem]"
              data-node-id="85:41"
            >
              TheMist
            </h1>
          </div>

          <div className="flex w-[60px] items-center justify-end max-[720px]:w-[44px]">
            <button
              className="flex h-[52px] w-[52px] cursor-pointer items-center justify-center rounded-[10px] border border-[rgba(255,255,255,0.06)] bg-[rgba(50,48,45,0.65)] p-0 text-[rgba(255,255,255,0.32)] transition-all duration-200 hover:-translate-y-px hover:bg-[rgba(50,48,45,0.78)] max-[720px]:h-11 max-[720px]:w-7"
              type="button"
              aria-label="Information"
              aria-haspopup="dialog"
              aria-expanded={isIntroOpen}
              data-node-id="85:42"
              onClick={() => setIsIntroOpen(true)}
            >
              <span
                className="block -translate-y-px text-[2.5rem] leading-none font-normal [font-family:var(--font-display)] max-[720px]:text-[2rem]"
                data-node-id="85:44"
              >
                i
              </span>
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
