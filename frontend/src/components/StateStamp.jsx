const LABELS = {
  DRAFT: "Draft",
  SENT: "Sent",
  TAKEN: "Taken",
  REJECTED: "Rejected",
};

export default function StateStamp({ state }) {
  const cls = state ? state.toLowerCase() : "draft";
  return <span className={`stamp ${cls}`}>{LABELS[state] || state}</span>;
}
