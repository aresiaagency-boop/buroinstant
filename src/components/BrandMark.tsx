export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-mark" aria-label="BUROINSTANT">
      <span className="brand-sigil" aria-hidden="true">
        <span />
      </span>
      {!compact && (
        <span className="brand-word">
          BURO<span>INSTANT</span>
        </span>
      )}
    </span>
  );
}
