'use client';
import { createContext, useContext } from 'react';
import { prefsSchema, type Prefs } from '@/domain/prefs';

const PrefsContext = createContext<Prefs>(prefsSchema.parse({}));
export const PrefsProvider = PrefsContext.Provider;
export const usePrefs = () => useContext(PrefsContext);
