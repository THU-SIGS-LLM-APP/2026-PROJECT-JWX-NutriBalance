import { UserPreferences, MealRecord, DailyNutrition } from '../types';

const STORAGE_KEYS = {
  PREFERENCES: 'nutribalance_preferences',
  MEALS: 'nutribalance_meals',
  FAVORITES: 'nutribalance_favorites',
  HISTORY: 'nutribalance_history'
};

export const getPreferences = (): UserPreferences | null => {
  const data = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
  return data ? JSON.parse(data) : null;
};

export const savePreferences = (preferences: UserPreferences): void => {
  localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(preferences));
};

export const getDefaultPreferences = (): UserPreferences => ({
  id: crypto.randomUUID(),
  flavors: [],
  cuisines: [],
  allergies: [],
  dislikes: [],
  dailyCalorieGoal: 2000,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

export const getMealRecords = (): MealRecord[] => {
  const data = localStorage.getItem(STORAGE_KEYS.MEALS);
  return data ? JSON.parse(data) : [];
};

export const saveMealRecord = (record: MealRecord): void => {
  const records = getMealRecords();
  const existingIndex = records.findIndex(r => r.id === record.id);
  if (existingIndex >= 0) {
    records[existingIndex] = record;
  } else {
    records.push(record);
  }
  localStorage.setItem(STORAGE_KEYS.MEALS, JSON.stringify(records));
};

export const deleteMealRecord = (id: string): void => {
  const records = getMealRecords().filter(r => r.id !== id);
  localStorage.setItem(STORAGE_KEYS.MEALS, JSON.stringify(records));
};

export const getFavorites = (): string[] => {
  const data = localStorage.getItem(STORAGE_KEYS.FAVORITES);
  return data ? JSON.parse(data) : [];
};

export const toggleFavorite = (recipeId: string): string[] => {
  const favorites = getFavorites();
  const index = favorites.indexOf(recipeId);
  if (index >= 0) {
    favorites.splice(index, 1);
  } else {
    favorites.push(recipeId);
  }
  localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites));
  return favorites;
};

export const getHistory = (): string[] => {
  const data = localStorage.getItem(STORAGE_KEYS.HISTORY);
  return data ? JSON.parse(data) : [];
};

export const addToHistory = (recipeId: string): void => {
  let history = getHistory();
  history = history.filter(id => id !== recipeId);
  history.unshift(recipeId);
  history = history.slice(0, 20);
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
};

export const getTodayMeals = (): MealRecord[] => {
  const today = new Date().toISOString().split('T')[0];
  return getMealRecords().filter(r => r.date === today);
};

export const getTodayNutrition = (): DailyNutrition => {
  const todayMeals = getTodayMeals();
  const today = new Date().toISOString().split('T')[0];
  
  return {
    date: today,
    totalCalories: todayMeals.reduce((sum, m) => sum + m.totalCalories, 0),
    totalProtein: todayMeals.reduce((sum, m) => sum + m.totalProtein, 0),
    totalCarbs: todayMeals.reduce((sum, m) => sum + m.totalCarbs, 0),
    totalFat: todayMeals.reduce((sum, m) => sum + m.totalFat, 0)
  };
};

export const getWeekNutrition = (): DailyNutrition[] => {
  const records = getMealRecords();
  const result: DailyNutrition[] = [];
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    const dayMeals = records.filter(r => r.date === dateStr);
    result.push({
      date: dateStr,
      totalCalories: dayMeals.reduce((sum, m) => sum + m.totalCalories, 0),
      totalProtein: dayMeals.reduce((sum, m) => sum + m.totalProtein, 0),
      totalCarbs: dayMeals.reduce((sum, m) => sum + m.totalCarbs, 0),
      totalFat: dayMeals.reduce((sum, m) => sum + m.totalFat, 0)
    });
  }
  
  return result;
};
