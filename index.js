const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// 24時間経過したファイルを自動削除する関数
exports.cleanupExpiredFiles = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
  const db = admin.database();
  const storage = admin.storage();
  const bucket = storage.bucket();
  
  // 24時間前のタイムスタンプを計算
  const expirationTime = Date.now() - (24 * 60 * 60 * 1000);
  
  try {
    // Realtime Databaseからすべてのファイルエントリを取得
    const snapshot = await db.ref('files').once('value');
    const sessions = snapshot.val();
    
    if (!sessions) {
      console.log('No sessions found to clean up');
      return null;
    }
    
    const deletePromises = [];
    const dbDeletePromises = [];
    
    // 各セッションとファイルをチェック
    for (const sessionId in sessions) {
      const sessionFiles = sessions[sessionId];
      
      for (const fileId in sessionFiles) {
        const fileData = sessionFiles[fileId];
        
        // ファイルが24時間以上経過しているかチェック
        if (fileData.timestamp && fileData.timestamp < expirationTime) {
          console.log(`Deleting expired file: ${fileId} from session ${sessionId}`);
          
          // URLからファイルパスを抽出
          const fileUrl = fileData.url;
          const filePathMatch = fileUrl.match(/o\/([^?]+)/);
          
          if (filePathMatch && filePathMatch[1]) {
            const filePath = decodeURIComponent(filePathMatch[1]);
            
            // Storageからファイルを削除
            deletePromises.push(bucket.file(filePath).delete().catch(err => {
              console.error(`Error deleting file ${filePath} from Storage:`, err);
            }));
            
            // Realtime Databaseからファイルエントリを削除
            dbDeletePromises.push(db.ref(`files/${sessionId}/${fileId}`).remove().catch(err => {
              console.error(`Error deleting file ${fileId} from Database:`, err);
            }));
          }
        }
      }
      
      // セッション内のファイルがすべて削除された場合、セッション自体も削除
      const sessionRef = db.ref(`files/${sessionId}`);
      const sessionSnapshot = await sessionRef.once('value');
      if (!sessionSnapshot.exists() || Object.keys(sessionSnapshot.val()).length === 0) {
        dbDeletePromises.push(sessionRef.remove().catch(err => {
          console.error(`Error deleting empty session ${sessionId}:`, err);
        }));
      }
    }
    
    // すべての削除処理を待機
    await Promise.all([...deletePromises, ...dbDeletePromises]);
    
    console.log('Cleanup completed successfully');
    return null;
  } catch (error) {
    console.error('Error during cleanup:', error);
    return null;
  }
});
