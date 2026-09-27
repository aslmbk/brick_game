import "./RightPanel.css";
import { GridCell } from "../grid-cell/GridCell";
import { useGame } from "../../game/store";

const SIDE = [0, 1, 2, 3];
const INFO = {
  title: "Press Start",
  pause: "Pause",
  ending: "Game Over",
  over: <>Game Over<br />Press Start</>,
};

export const RightPanel = () => {
  const mode = useGame((s) => s.view.mode);
  const next = useGame((s) => s.view.next);
  const level = useGame((s) => s.view.level);
  const score = useGame((s) => s.view.score);
  const hiScore = useGame((s) => s.view.hiScore);
  const lines = useGame((s) => s.view.lines);
  const off = mode === "off";

  return (
    <div className="right-panel">
      <div className="next-figure">
        {/* the 2×4 preview sits in the middle rows of a 4×4 box */}
        {SIDE.map((r) => (
          <div key={r} className="row">
            {SIDE.map((c) => {
              const lit = (r === 1 || r === 2) && next[(r - 1) * 4 + c];
              return <GridCell key={c} opacity={off ? 0 : lit ? 1 : 0.03} />;
            })}
          </div>
        ))}
      </div>

      {!off && <>
        <div className="stat-row">Level</div>
        <div className="stat-value">{level}</div>

        <div className="stat-row">Score</div>
        <div className="stat-value">{score}</div>

        <div className="stat-row">High score</div>
        <div className="stat-value">{hiScore}</div>

        <div className="stat-row">Lines</div>
        <div className="stat-value">{lines}</div>

        <div className="info">{INFO[mode]}</div>
      </>}
    </div>
  );
};
