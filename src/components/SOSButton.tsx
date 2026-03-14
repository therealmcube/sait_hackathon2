import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import { useTheme } from '../contexts/ThemeContext';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { AlertOctagon, X, Send } from 'lucide-react';

export default function SOSButton() {
  const { user } = useAuth();
  const { location } = useLocation();
  const { isDarkMode } = useTheme();
  const [isTriggering, setIsTriggering] = useState(false);
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const [contactsNotified, setContactsNotified] = useState<{ name: string; phone: string }[]>([]);

  const triggerSOS = async () => {
    if (!user || isTriggering) return;
    
    setIsTriggering(true);
    try {
      // Fetch emergency contacts
      const userRef = doc(db, 'users', user.uid);
      let userSnap;
      try {
        userSnap = await getDoc(userRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      }
      
      const contacts = userSnap && userSnap.exists() ? (userSnap.data().emergency_contacts || []) : [];
      setContactsNotified(contacts);

      // Create an emergency alert in Firestore
      try {
        await addDoc(collection(db, 'emergency_alerts'), {
          user_id: user.uid,
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          timestamp: new Date().toISOString(),
          status: 'active',
          contacts_notified: contacts
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'emergency_alerts');
      }

      // Generate Maps link
      const mapsLink = location 
        ? `https://www.google.com/maps?q=${location.latitude},${location.longitude}`
        : 'Location unavailable';
      
      const contactList = contacts.length > 0 
        ? contacts.map((c: any) => `${c.name} (${c.phone})`).join(', ')
        : 'No emergency contacts configured';

      const alertText = `Emergency Alert!\nUser may be in danger.\nLocation: ${mapsLink}\nTimestamp: ${new Date().toLocaleString()}\n\nContacts Notified: ${contactList}`;
      
      // Vibrate if supported
      if (navigator.vibrate) {
        navigator.vibrate([500, 200, 500, 200, 500]);
      }

      // Attempt to share via Web Share API
      let shared = false;
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Emergency Alert - Aegis',
            text: alertText,
            url: location ? mapsLink : undefined,
          });
          shared = true;
        } catch (shareError) {
          console.warn('Web Share API failed or was cancelled:', shareError);
        }
      } 
      
      if (!shared) {
        setModalMessage(alertText);
      }
      
    } catch (error) {
      console.error('Failed to trigger SOS:', error);
      setModalMessage('Failed to trigger SOS. Please call emergency services directly.');
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <>
      <button
        onClick={triggerSOS}
        disabled={isTriggering}
        className="fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white shadow-xl shadow-red-600/30 transition-transform hover:scale-110 active:scale-95 disabled:opacity-50"
        aria-label="Trigger SOS"
      >
        <AlertOctagon className="h-8 w-8" />
      </button>

      {modalMessage && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-blue-950/60 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-sm rounded-2xl p-6 shadow-2xl transition-colors ${isDarkMode ? 'bg-blue-900' : 'bg-white'}`}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-500">
                <AlertOctagon className="h-6 w-6" />
                <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-blue-950'}`}>SOS Triggered</h3>
              </div>
              <button 
                onClick={() => setModalMessage(null)} 
                className={`rounded-full p-2 transition-colors ${isDarkMode ? 'bg-blue-800 text-blue-200 hover:bg-blue-700' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className={`mb-6 rounded-xl p-4 transition-colors ${isDarkMode ? 'bg-red-900/40 text-red-400' : 'bg-red-50 text-red-700'}`}>
              <p className="text-sm font-semibold uppercase tracking-wider mb-2">Emergency Broadcast Sent</p>
              <p className="text-xs opacity-80">Your location has been shared with your emergency contacts and recorded in our system.</p>
            </div>

            <div className="mb-6">
              <p className={`text-sm font-bold mb-2 flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-blue-950'}`}>
                <Send className="h-4 w-4 text-emerald-500" />
                Notified Contacts:
              </p>
              <div className="space-y-2">
                {contactsNotified.length > 0 ? (
                  contactsNotified.map((c, i) => (
                    <div key={i} className={`text-sm px-3 py-2 rounded-lg border transition-colors ${isDarkMode ? 'text-blue-200 bg-blue-950/40 border-blue-800' : 'text-blue-700 bg-blue-50/30 border-blue-100'}`}>
                      <span className="font-medium">{c.name}</span>: {c.phone}
                    </div>
                  ))
                ) : (
                  <p className={`text-sm italic ${isDarkMode ? 'text-blue-400' : 'text-blue-400'}`}>No contacts configured. Please add them in Home settings.</p>
                )}
              </div>
            </div>

            <p className={`whitespace-pre-line text-xs p-3 rounded-lg border mb-6 font-mono transition-colors ${isDarkMode ? 'text-blue-400 bg-blue-950/20 border-blue-800' : 'text-blue-500 bg-blue-50/20 border-blue-50'}`}>
              {modalMessage.split('\n\n')[0]}
            </p>

            <button
              onClick={() => setModalMessage(null)}
              className={`w-full rounded-xl py-3 font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] ${isDarkMode ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-blue-950 hover:bg-blue-900'}`}
            >
              I am Safe Now
            </button>
          </div>
        </div>
      )}
    </>
  );
}
