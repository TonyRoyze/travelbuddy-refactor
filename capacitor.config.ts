import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.travelbuddy.app",
  appName: "TravelBuddy",
  webDir: "dist",
  plugins: {
    PushNotifications: { presentationOptions: ["banner", "list", "sound"] },
  },
  ios: {
    // The web shell handles safe areas, including its fixed bottom navigation.
    contentInset: "never",
  },
};

export default config;
