import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, Timestamp, updateDoc, doc, increment, getDoc } from 'firebase/firestore';

// Replace with your project's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA4QgG7EbX-6nVuUXocVK0W5cZS5LJlxAY",
  authDomain: "soapstone-8373a.firebaseapp.com",
  projectId: "soapstone-8373a",
  storageBucket: "soapstone-8373a.firebasestorage.app",
  messagingSenderId: "138436646343",
  appId: "1:138436646343:web:6d6a6b4ec2dbd73878f5e2",
  measurementId: "G-C3RSPDYXD9"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COLLECTION_NAME = 'soapstones';

export const getSoapstones = (callback) => {
  const q = query(collection(db, COLLECTION_NAME), orderBy('datetime', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Handle timestamp converting to date
      datetime: doc.data().datetime?.toDate(),
    }));
    callback(items);
  });
};

export const addSoapstone = async (message, coordinate, elevation, username = '') => {
  try {
    await addDoc(collection(db, COLLECTION_NAME), {
      message,
      coordinate, // { lat: number, lng: number }
      datetime: Timestamp.now(),
      elevation: Number(elevation) || 0,
      username: username || 'Anonymous',
      reactions: {
        likes: {},
        dislikes: {},
      },
    });
  } catch (error) {
    console.error("Error adding document: ", error);
    throw error;
  }
};

export const addReaction = async (id, username, reactionType) => {
  const ref = doc(db, COLLECTION_NAME, id);
  const reactionKey = reactionType === 'like' ? 'reactions.likes' : 'reactions.dislikes';
  const otherKey = reactionType === 'like' ? 'reactions.dislikes' : 'reactions.likes';
  
  try {
    // Add user to the reaction
    await updateDoc(ref, {
      [reactionKey]: {
        ...((await getDoc(ref)).data()?.reactions?.[reactionType === 'like' ? 'likes' : 'dislikes'] || {}),
        [username]: true,
      },
    });
    
    // Remove user from the opposite reaction if they had it
    const docData = (await getDoc(ref)).data();
    const oppositeReactions = docData?.reactions?.[reactionType === 'like' ? 'dislikes' : 'likes'] || {};
    if (oppositeReactions[username]) {
      const updatedOpposite = { ...oppositeReactions };
      delete updatedOpposite[username];
      await updateDoc(ref, {
        [otherKey]: updatedOpposite,
      });
    }
  } catch (error) {
    console.error("Error adding reaction: ", error);
    throw error;
  }
};

export const removeReaction = async (id, username, reactionType) => {
  const ref = doc(db, COLLECTION_NAME, id);
  const reactionKey = reactionType === 'like' ? 'reactions.likes' : 'reactions.dislikes';
  
  try {
    const docData = (await getDoc(ref)).data();
    const reactions = docData?.reactions?.[reactionType === 'like' ? 'likes' : 'dislikes'] || {};
    const updatedReactions = { ...reactions };
    delete updatedReactions[username];
    
    await updateDoc(ref, {
      [reactionKey]: updatedReactions,
    });
  } catch (error) {
    console.error("Error removing reaction: ", error);
    throw error;
  }
};

export const upvoteSoapstone = async (id) => {
  const ref = doc(db, COLLECTION_NAME, id);
  await updateDoc(ref, {
    upvotes: increment(1)
  });
};

export default db;
