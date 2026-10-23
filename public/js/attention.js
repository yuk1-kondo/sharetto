/** 背景タブで受信したとき、タブタイトルに未読数を出す */

const baseTitle = document.title;
let unread = 0;

export function markIncoming() {
  if (!document.hidden) return;
  unread += 1;
  document.title = `(${unread}) ${baseTitle}`;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden || unread === 0) return;
  unread = 0;
  document.title = baseTitle;
});
