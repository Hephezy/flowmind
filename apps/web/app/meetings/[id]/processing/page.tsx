import FlowMind from "../../../../components/FlowMind";
export function generateStaticParams() {
  return Array.from({ length: 8 }, (_, i) => ({ id: "m" + (i + 1) }));
}
export default function Page() {
  return <FlowMind />;
}
