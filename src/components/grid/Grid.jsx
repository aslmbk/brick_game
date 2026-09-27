import { useGame } from "../../game/store";
import { GridCell } from "../grid-cell/GridCell";
import "./Grid.css";

const OPACITY = [0.03, 1, 0.3]; // empty, lit, ghost
const ROWS = [...Array(20).keys()];
const COLS = [...Array(10).keys()];

export const Grid = () => {
  const cells = useGame((s) => s.view.cells);
  const off = useGame((s) => s.view.mode === "off");

  return (
    <div className="grid-container">
      {ROWS.map((r) => (
        <div key={r} className="row">
          {COLS.map((c) => (
            <GridCell key={c} opacity={off ? 0 : OPACITY[cells[r * 10 + c]]} />
          ))}
        </div>
      ))}
    </div>
  );
};
