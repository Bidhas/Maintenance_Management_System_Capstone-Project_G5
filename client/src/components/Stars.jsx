/** Read-only (value) or clickable (onChange) star rating. */
export default function Stars({ value = 0, onChange }) {
  return (
    <span className="stars" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (onChange
        ? <button type="button" key={n} className={n <= value ? 'on' : ''} onClick={() => onChange(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}>★</button>
        : <i key={n} className={n <= value ? 'on' : ''}>★</i>))}
    </span>
  );
}
