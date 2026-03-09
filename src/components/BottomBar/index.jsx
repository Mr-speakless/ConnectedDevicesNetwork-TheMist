import { GlassCard } from '@developer-hub/liquid-glass';
import logoIcon from '../../assets/Logo.svg';
import styles from './styles.module.css';

export default function BottomBar() {
  return (
    <div className="relative w-full">
      <GlassCard blurAmount={0.08} cornerRadius={20} className={styles.barGlass}>
        {/* let the div blow to be full of it's father div */}
        <div className="flex w-full items-center rounded-[20px] bg-[rgba(255,255,255,0.22)] px-[10px] py-[10px]" data-node-id="85:34">
          <div className="flex w-[px] items-center justify-start max-[720px]:w-[44px]">
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
              data-node-id="85:42"
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
