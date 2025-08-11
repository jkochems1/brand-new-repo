export function getRollingYearStart() {
  const today = new Date();
  const year = today.getMonth() > 6 || (today.getMonth() === 6 && today.getDate() >= 5)
    ? today.getFullYear()
    : today.getFullYear() - 1;
  return new Date(year, 6, 5); // July is month index 6
}

export function formatDate(date) {
  return date.toISOString().split('T')[0];
}
