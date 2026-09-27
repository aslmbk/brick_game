export const GridCell = ({ opacity = 0.03 }) => {
  return (
    <svg
      version="1.0"
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
    >
      <rect
        width="16"
        height="16"
        fill="rgba(0, 0, 0, 0)"
        stroke="#000"
        strokeWidth={2}
        opacity={opacity}
        rx="2"
      />
      <rect
        x={3}
        y={3}
        width="10"
        height="10"
        fill="#000"
        opacity={opacity}
        rx="1"
      />
    </svg>
  );
};
