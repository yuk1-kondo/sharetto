const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// 10分後にファイルを自動削除（より頻繁にチェック）
exports.cleanupOldFiles = functions.pubsub.schedule('every 2 minutes').onRun(async (context) => {
  const db = admin.database();
  const now = Date.now();
  const tenMinutesAgo = now - (10 * 60 * 1000); // 10分前
  
  let deletedCount = 0;
  
  // files/ 配下の古いデータを削除
  const filesRef = db.ref('files');
  const filesSnapshot = await filesRef.once('value');
  
  if (filesSnapshot.exists()) {
    const deletePromises = [];
    
    filesSnapshot.forEach((sessionSnap) => {
      sessionSnap.forEach((fileSnap) => {
        const fileData = fileSnap.val();
        if (fileData.timestamp < tenMinutesAgo) {
          deletePromises.push(fileSnap.ref.remove());
          deletedCount++;
          console.log(`Deleted old file: ${fileData.name} from session ${sessionSnap.key}`);
        }
      });
      
      // セッション内にファイルがなくなったらセッション自体も削除
      sessionSnap.forEach((fileSnap) => {
        const fileData = fileSnap.val();
        if (fileData.timestamp >= tenMinutesAgo) {
          return; // まだ有効なファイルがある
        }
      });
    });
    
    await Promise.all(deletePromises);
  }
  
  // pc-share/ 配下の古いデータも削除
  const pcShareRef = db.ref('pc-share');
  const pcShareSnapshot = await pcShareRef.once('value');
  
  if (pcShareSnapshot.exists()) {
    const deletePromises = [];
    
    pcShareSnapshot.forEach((sessionSnap) => {
      sessionSnap.forEach((fileSnap) => {
        const fileData = fileSnap.val();
        if (fileData.timestamp < tenMinutesAgo) {
          deletePromises.push(fileSnap.ref.remove());
          deletedCount++;
          console.log(`Deleted old PC share file: ${fileData.name} from session ${sessionSnap.key}`);
        }
      });
    });
    
    await Promise.all(deletePromises);
  }
  
  console.log(`Cleanup completed - Deleted ${deletedCount} files older than 10 minutes`);
  return null;
});
