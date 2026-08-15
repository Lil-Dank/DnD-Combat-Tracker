/**
 * Renders SRD action description text. The dataset carries markdown remnants
 * (`**bold**`, `- ` list dashes); render bold properly and turn dashes into
 * bullets instead of showing raw asterisks.
 */
export function AttackText({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.trimEnd()).filter((l, i, arr) => l !== '' || arr[i - 1] !== '');
  return (
    <p className="attack-desc">
      {lines.map((line, i) => {
        const clean = line.replace(/^\s*-\s+/, '• ');
        const parts = clean.split(/\*\*(.+?)\*\*/g);
        return (
          <span key={i}>
            {parts.map((part, j) => (j % 2 === 1 ? <strong key={j}>{part}</strong> : part))}
            {i < lines.length - 1 && <br />}
          </span>
        );
      })}
    </p>
  );
}
