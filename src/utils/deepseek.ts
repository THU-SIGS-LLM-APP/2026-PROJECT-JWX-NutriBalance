import { recipes } from '../data/recipes';
import { UserPreferences, MealRecord } from '../types';
import { getTodayMeals } from './storage';

const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY || '';
const USE_PROXY = true;

export interface DeepSeekRecommendation {
  recipes: typeof recipes;
  reason: string;
  nutritionAdvice: string;
}

function buildPrompt(preferences: UserPreferences, todayMeals: MealRecord[]): string {
  const todayNutrition = {
    calories: todayMeals.reduce((sum, m) => sum + m.totalCalories, 0),
    protein: todayMeals.reduce((sum, m) => sum + m.totalProtein, 0),
    carbs: todayMeals.reduce((sum, m) => sum + m.totalCarbs, 0),
    fat: todayMeals.reduce((sum, m) => sum + m.totalFat, 0)
  };

  const remainingCalories = Math.max(0, preferences.dailyCalorieGoal - todayNutrition.calories);
  const remainingProtein = Math.max(0, 60 - todayNutrition.protein);
  const remainingCarbs = Math.max(0, 200 - todayNutrition.carbs);
  const remainingFat = Math.max(0, 50 - todayNutrition.fat);

  const eatenFoods = todayMeals.flatMap(m => m.foods.map(f => f.name)).join('、');

  return `你是专业的营养饮食助手。请根据以下信息推荐菜品：

用户偏好：
- 口味偏好：${preferences.flavors.join('、') || '无'}
- 喜欢的菜系：${preferences.cuisines.join('、') || '无'}
- 过敏原：${preferences.allergies.join('、') || '无'}
- 不喜欢的食物：${preferences.dislikes.join('、') || '无'}

今日已吃：${eatenFoods || '暂无记录'}

今日营养摄入：
- 热量：${todayNutrition.calories.toFixed(0)}/${preferences.dailyCalorieGoal} kcal（剩余 ${remainingCalories} kcal）
- 蛋白质：${todayNutrition.protein.toFixed(0)}g（需补充 ${remainingProtein.toFixed(0)}g）
- 碳水：${todayNutrition.carbs.toFixed(0)}g（需补充 ${remainingCarbs.toFixed(0)}g）
- 脂肪：${todayNutrition.fat.toFixed(0)}g（需补充 ${remainingFat.toFixed(0)}g）

菜品库：
${recipes.map(r => `- ${r.name} (${r.cuisine}, ${r.prepTime}分钟, ${r.calories}kcal, 标签:${r.tags.join(',')})`).join('\n')}

请推荐1-2道最合适的菜品，只返回菜品名称和推荐理由。`;
}

export async function getDeepSeekRecommendations(
  preferences: UserPreferences,
  count: number = 4
): Promise<DeepSeekRecommendation> {
  if (!DEEPSEEK_API_KEY) {
    console.warn('DeepSeek API key not configured, using fallback recommendations');
    return getFallbackRecommendations(preferences, count);
  }

  const todayMeals = getTodayMeals();
  const prompt = buildPrompt(preferences, todayMeals);

  try {
    const apiUrl = USE_PROXY ? '/api/deepseek' : 'https://api.deepseek.com/v1/chat/completions';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一个专业的营养饮食助手。请根据用户的口味偏好、营养摄入情况和饮食历史推荐合适的菜品。推荐时考虑营养均衡、口味匹配和食物多样性。只返回菜品名称和简短推荐理由。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    const recommendedRecipes = parseRecipeNames(content, count, preferences);
    
    const reasonMatch = content.match(/推荐理由[：:](.+?)(?:。|$)/);
    const reason = reasonMatch ? reasonMatch[1].trim() : '根据您的口味偏好和今日营养摄入推荐';

    return {
      recipes: recommendedRecipes,
      reason: reason.substring(0, 50),
      nutritionAdvice: generateNutritionAdvice(preferences, todayMeals)
    };
  } catch (error) {
    console.error('DeepSeek API error:', error);
    return getFallbackRecommendations(preferences, count);
  }
}

function parseRecipeNames(content: string, count: number, preferences: UserPreferences): typeof recipes {
  const selectedRecipes: typeof recipes = [];
  const usedIds = new Set<string>();

  for (const recipe of recipes) {
    if (selectedRecipes.length >= count) break;
    if (usedIds.has(recipe.id)) continue;

    if (content.includes(recipe.name)) {
      selectedRecipes.push(recipe);
      usedIds.add(recipe.id);
    }
  }

  if (selectedRecipes.length === 0) {
    return getFallbackRecommendations(preferences, count).recipes;
  }

  return selectedRecipes;
}

function generateNutritionAdvice(preferences: UserPreferences, todayMeals: MealRecord[]): string {
  const todayNutrition = {
    calories: todayMeals.reduce((sum, m) => sum + m.totalCalories, 0),
    protein: todayMeals.reduce((sum, m) => sum + m.totalProtein, 0),
    carbs: todayMeals.reduce((sum, m) => sum + m.totalCarbs, 0),
    fat: todayMeals.reduce((sum, m) => sum + m.totalFat, 0)
  };

  const remainingCalories = preferences.dailyCalorieGoal - todayNutrition.calories;

  if (remainingCalories < 300) {
    return '今日热量摄入已接近目标，建议选择低热量的清淡菜品';
  } else if (todayNutrition.protein < 30) {
    return '蛋白质摄入不足，建议增加肉类、豆制品等高蛋白食物';
  } else if (preferences.flavors.includes('辣')) {
    return '今日推荐川湘菜系，辛辣开胃促进消化';
  } else {
    return '营养摄入较为均衡，保持当前饮食习惯';
  }
}

export function getFallbackRecommendations(
  preferences: UserPreferences,
  count: number
): DeepSeekRecommendation {
  const todayMeals = getTodayMeals();
  const todayFoodsEaten = new Set(
    todayMeals.flatMap((meal: MealRecord) => 
      meal.foods.map(f => f.name.toLowerCase())
    )
  );

  let filtered = recipes.filter(recipe => {
    if (preferences.allergies.some(allergy => 
      recipe.ingredients.some(ing => ing.toLowerCase().includes(allergy.toLowerCase()))
    )) return false;

    if (preferences.dislikes.some(dislike => 
      recipe.ingredients.some(ing => ing.toLowerCase().includes(dislike.toLowerCase())) ||
      recipe.name.toLowerCase().includes(dislike.toLowerCase())
    )) return false;

    return true;
  });

  if (preferences.cuisines.length > 0) {
    filtered = filtered.sort((a, b) => {
      const aMatch = preferences.cuisines.includes(a.cuisine) ? 1 : 0;
      const bMatch = preferences.cuisines.includes(b.cuisine) ? 1 : 0;
      return bMatch - aMatch;
    });
  }

  const selected = filtered.slice(0, count);

  return {
    recipes: selected,
    reason: '根据您的偏好和今日营养摄入推荐',
    nutritionAdvice: generateNutritionAdvice(preferences, todayMeals)
  };
}
