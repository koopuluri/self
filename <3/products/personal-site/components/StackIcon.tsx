// Original geometry from Ghost's assets/manifesto-stack-icons.svg.
// Navigation styles control stroke weight and color for the selected segment.
const paths = {
  personhood: "M12 20C10.5 18.7 3.5 13.8 3.5 9.2C3.5 6.5 5.45 4.7 8 4.7C9.7 4.7 11.2 5.6 12 7.1C12.8 5.6 14.3 4.7 16 4.7C18.55 4.7 20.5 6.5 20.5 9.2C20.5 13.8 13.5 18.7 12 20Z",
  ai: "M3.6 5.5H20.4M8.2 5.5V14.8C8.2 17.1 7.5 18.9 5.9 20M15.8 5.5V14.8C15.8 17.1 16.5 18.9 18.1 20",
  stock: "M18.5 7.2C17.15 5.65 14.95 4.8 12.3 4.8C8.8 4.8 6.2 6.4 6.2 9C6.2 11.6 8.8 12.1 12.2 12.6C15.6 13.1 18 13.8 18 16.3C18 18.7 15.5 20 12.1 20C9.3 20 6.8 19 5.4 17.1M12 2.5V22",
};

export type Section = keyof typeof paths;

export function StackIcon({ section, size = 18, stroke = "currentColor", strokeWidth = 1.8 }: {
  section: Section;
  size?: number;
  stroke?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={stroke}
      strokeOpacity=".96"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[section]} />
    </svg>
  );
}
