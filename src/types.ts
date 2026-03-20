export interface FoodItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: number;
  unit: string;
}

export interface MealRecord {
  id: string;
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  foods: FoodItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  notes?: string;
}

export interface Recipe {
  id: string;
  name: string;
  nameEn: string;
  cuisine: string;
  mealType: ('breakfast' | 'lunch' | 'dinner' | 'snack')[];
  prepTime: number;
  difficulty: 'easy' | 'medium' | 'hard';
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: string[];
  steps: string[];
  image: string;
  tags: string[];
}

export interface UserPreferences {
  id: string;
  flavors: string[];
  cuisines: string[];
  allergies: string[];
  dislikes: string[];
  dailyCalorieGoal: number;
  createdAt: string;
  updatedAt: string;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface DailyNutrition {
  date: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
}
