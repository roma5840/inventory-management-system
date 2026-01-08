import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBcfJQj3vGDvSN1oHbfhXtH709sfl_hwB0",
  authDomain: "inventory-system-eb3c4.firebaseapp.com",
  projectId: "inventory-system-eb3c4",
  storageBucket: "inventory-system-eb3c4.firebasestorage.app",
  messagingSenderId: "1073334950252",
  appId: "1:1073334950252:web:4c20a501413e4af83dfb49"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };