import { useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { SPECIAL_USERS, type SpecialUserConfig } from '@/lib/constants';
import { useTheme, type ThemeName } from '@/contexts/ThemeContext';

interface UseSpecialUserResult {
  isSpecialUser: boolean;
  specialConfig: SpecialUserConfig | null;
  userId: string | undefined;
  defaultTheme: ThemeName | null;
}

export function useSpecialUser(): UseSpecialUserResult {
  const { data: session, status } = useSession();
  const { setTheme } = useTheme();
  
  const userId = session?.user?.id;
  const isSpecialUser = userId ? userId in SPECIAL_USERS : false;
  const specialConfig = isSpecialUser && userId ? SPECIAL_USERS[userId] : null;
  
  // Get the default theme for this special user
  const defaultTheme = specialConfig?.theme ? specialConfig.theme as ThemeName : null;
  
  // Auto-apply the special user's default theme when they log in
  // Only apply when session is loaded and user is logged in
  useEffect(() => {
    if (status === 'loading') return; // Wait for session to load
    
    if (session && isSpecialUser && defaultTheme) {
      // Check if user has manually selected a theme (not auto-applied)
      const manualThemeSelected = localStorage.getItem('guild-theme-manual');
      if (!manualThemeSelected) {
        setTheme(defaultTheme);
      }
    }
  }, [session, isSpecialUser, defaultTheme, status, setTheme]);
  
  return {
    isSpecialUser,
    specialConfig,
    userId,
    defaultTheme,
  };
}
