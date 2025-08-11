// src/utils/date.js

// Returns the current season window based on the rolling year that starts July 5.
export function getSeasonWindow(today = new Date()) {
  const year = today.getFullYear();
  const july5 = new Date(year, 6, 5); // month is 0-based: 6 = July
  let start, end;

  if (today >= july5) {
    // Season runs Jul 5 (this year) → Jul 4 (next year)
    start = new Date(year, 6, 5);
    end = new Date(year + 1, 6, 4, 23, 59, 59, 999);
  } else {
    // Season runs Jul 5 (last year) → Jul 4 (this year)
    start = new Date(year - 1, 6, 5);
    end = new Date(year, 6, 4, 23, 59, 59, 999);
  }
  return { start, end };
}

// Nicely format dates for the History table.
export function formatDate(d) {
  return new Date(d).toLocaleDateString();
}
