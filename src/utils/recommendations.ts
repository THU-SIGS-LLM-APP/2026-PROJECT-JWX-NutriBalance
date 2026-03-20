import { Recipe, UserPreferences, DailyNutrition } from '../types';
import { recipes } from '../data/recipes';
import { getMealRecords, getWeekNutrition, getTodayNutrition, getTodayMeals } from './storage';

export interface RecommendationResult {
  recipes: Recipe[];
  reason: string;
}

const analyzeNutrientGaps = (todayNutrition: DailyNutrition, calorieGoal: number): string[] => {
  const gaps: string[] = [];
  
  const proteinRatio = todayNutrition.totalProtein / (calorieGoal * 0.15 / 4);
  if (proteinRatio < 0.5) gaps.push('蛋白质');
  
  const carbsRatio = todayNutrition.totalCarbs / (calorieGoal * 0.5 / 4);
  if (carbsRatio < 0.5) gaps.push('碳水化合物');
  
  if (todayNutrition.totalCalories < calorieGoal * 0.3) gaps.push('热量');
  
  return gaps;
};

export const getAIRecommendations = (preferences: UserPreferences, count: number = 4): RecommendationResult => {
  const allRecipes = [...recipes];
  const todayNutrition = getTodayNutrition();
  const weekNutrition = getWeekNutrition();
  
  let scoredRecipes = allRecipes.map(recipe => {
    let score = 0;
    
    if (preferences.cuisines.includes(recipe.cuisine)) {
      score += 30;
    }
    
    const userFlavorTags = preferences.flavors.map(f => f.toLowerCase());
    const recipeTags = recipe.tags.map(t => t.toLowerCase());
    const hasMatchingFlavor = recipeTags.some(tag => 
      userFlavorTags.some(flavor => tag.includes(flavor) || flavor.includes(tag))
    );
    if (hasMatchingFlavor) score += 20;
    
    const hasDislike = preferences.dislikes.some(dislike => 
      recipe.ingredients.some(ing => ing.toLowerCase().includes(dislike.toLowerCase())) ||
      recipe.name.toLowerCase().includes(dislike.toLowerCase())
    );
    if (hasDislike) score -= 100;
    
    const hasAllergy = preferences.allergies.some(allergy => 
      recipe.ingredients.some(ing => ing.toLowerCase().includes(allergy.toLowerCase()))
    );
    if (hasAllergy) score -= 200;
    
    const gaps = analyzeNutrientGaps(todayNutrition, preferences.dailyCalorieGoal);
    if (gaps.includes('蛋白质') && recipe.protein > 25) score += 25;
    if (gaps.includes('碳水化合物') && recipe.carbs > 30) score += 20;
    if (gaps.includes('热量') && recipe.calories > 300) score += 20;
    
    const avgCalories = weekNutrition.reduce((sum, d) => sum + d.totalCalories, 0) / 7;
    if (avgCalories > preferences.dailyCalorieGoal && recipe.calories < 350) score += 15;
    if (avgCalories < preferences.dailyCalorieGoal * 0.7 && recipe.calories > 400) score += 15;
    
    return { recipe, score };
  });
  
  scoredRecipes.sort((a, b) => b.score - a.score);
  const recommended = scoredRecipes.slice(0, count).map(s => s.recipe);
  
  let reason = '';
  const gaps = analyzeNutrientGaps(todayNutrition, preferences.dailyCalorieGoal);
  if (gaps.length > 0) {
    reason = `根据您今日营养摄入，建议补充${gaps.join('、')}`;
  } else if (preferences.cuisines.length > 0) {
    reason = `为您推荐您喜欢的${preferences.cuisines[0]}菜系`;
  } else {
    reason = '根据您的口味偏好推荐';
  }
  
  return { recipes: recommended, reason };
};

export const getQuickRecommendations = (preferences: UserPreferences, count: number = 3): Recipe[] => {
  const quickRecipes = recipes.filter(r => r.prepTime <= 30);
  const seed = (preferences as any)._seed || 0;
  const todayMeals = getTodayMeals();
  const todayFoodsEaten = new Set(
    todayMeals.flatMap((meal: { foods: { name: string }[] }) => 
      meal.foods.map(f => f.name.toLowerCase())
    )
  );
  
  // 检查是否有用户主动选择的口味或菜系（通过 _seed 判断是主动选择）
  const hasActiveFlavorSelection = preferences.flavors.length > 0 && seed > 0;
  const hasActiveCuisineSelection = preferences.cuisines.length > 0 && seed > 0;
  
  let scoredRecipes = quickRecipes.map((recipe, index) => {
    let score = 0;
    
    const recipeFoods = recipe.ingredients.map(i => i.toLowerCase());
    const userFlavorTags = preferences.flavors.map(f => f.toLowerCase());
    const recipeTags = recipe.tags.map(t => t.toLowerCase());
    
    // 菜系匹配 - 最高优先级
    if (preferences.cuisines.includes(recipe.cuisine)) {
      score += 100;
    }
    
    // 口味标签匹配
    const hasMatchingFlavor = recipeTags.some(tag => 
      userFlavorTags.some(flavor => tag.includes(flavor) || flavor.includes(tag))
    );
    if (hasMatchingFlavor) {
      score += 80;
    }
    
    // 食材口味匹配
    const flavorMatch = userFlavorTags.some(flavor => 
      recipeTags.some(tag => tag.includes(flavor) || flavor.includes(tag)) ||
      recipeFoods.some(rf => 
        flavor === '辣' && (rf.includes('辣') || rf.includes('辣椒') || rf.includes('麻') || rf.includes('花椒') || rf.includes('豆瓣')) ||
        flavor === '甜' && (rf.includes('糖') || rf.includes('甜') || rf.includes('蜂蜜')) ||
        flavor === '酸' && (rf.includes('酸') || rf.includes('醋') || rf.includes('柠檬')) ||
        flavor === '清淡' && (rf.includes('蒸') || rf.includes('煮') || rf.includes('凉拌')) ||
        flavor === '鲜' && (rf.includes('海鲜') || rf.includes('鱼') || rf.includes('虾') || rf.includes('贝')) ||
        flavor === '香' && (rf.includes('香') || rf.includes('烤') || rf.includes('煎'))
      )
    );
    if (flavorMatch) score += 60;
    
    // 如果用户主动选择了口味或菜系，未匹配的降低分数
    if (hasActiveFlavorSelection && !flavorMatch && !hasMatchingFlavor) {
      score -= 50;
    }
    if (hasActiveCuisineSelection && !preferences.cuisines.includes(recipe.cuisine)) {
      score -= 50;
    }
    
    // 避免重复食材
    const hasEatenSimilar = [...todayFoodsEaten].some(food => 
      recipeFoods.some(rf => rf.includes(food) || food.includes(rf))
    );
    if (hasEatenSimilar) {
      score -= 20;
    }
    
    // 避免当天已吃
    const alreadyEatenToday = todayMeals.some(meal => 
      meal.foods.some(f => 
        f.name.toLowerCase().includes(recipe.name.toLowerCase()) ||
        recipe.name.toLowerCase().includes(f.name.toLowerCase())
      )
    );
    if (alreadyEatenToday) {
      score -= 100;
    }
    
    // 热量调整（次要因素）
    const todayCalories = todayMeals.reduce((sum: number, m: { totalCalories: number }) => sum + m.totalCalories, 0);
    const calorieGoal = preferences.dailyCalorieGoal;
    if (todayCalories < calorieGoal * 0.3 && recipe.calories > 300) {
      score += 10;
    } else if (todayCalories > calorieGoal * 0.7 && recipe.calories < 250) {
      score += 5;
    }
    
    // 随机因子
    score += ((seed + index) % 5);
    
    return { recipe, score };
  });
  
  scoredRecipes = scoredRecipes.filter(item => {
    const hasAllergy = preferences.allergies.some(allergy => 
      item.recipe.ingredients.some(ing => ing.toLowerCase().includes(allergy.toLowerCase()))
    );
    const hasDislike = preferences.dislikes.some(dislike => 
      item.recipe.ingredients.some(ing => ing.toLowerCase().includes(dislike.toLowerCase())) ||
      item.recipe.name.toLowerCase().includes(dislike.toLowerCase())
    );
    return !hasAllergy && !hasDislike;
  });
  
  scoredRecipes.sort((a, b) => b.score - a.score);
  
  return scoredRecipes.slice(0, count).map(s => s.recipe);
};

export const getMealTypeRecommendations = (mealType: string, preferences: UserPreferences): Recipe[] => {
  return recipes
    .filter(recipe => {
      const matchesMealType = recipe.mealType.includes(mealType as any);
      const hasAllergy = preferences.allergies.some(allergy => 
        recipe.ingredients.some(ing => ing.toLowerCase().includes(allergy.toLowerCase()))
      );
      const hasDislike = preferences.dislikes.some(dislike => 
        recipe.ingredients.some(ing => ing.toLowerCase().includes(dislike.toLowerCase())) ||
        recipe.name.toLowerCase().includes(dislike.toLowerCase())
      );
      return matchesMealType && !hasAllergy && !hasDislike;
    })
    .slice(0, 6);
};

export const getSimilarRecipes = (recipeId: string, count: number = 4): Recipe[] => {
  const target = recipes.find(r => r.id === recipeId);
  if (!target) return [];
  
  return recipes
    .filter(r => r.id !== recipeId)
    .map(recipe => ({
      recipe,
      similarity: (
        (recipe.cuisine === target.cuisine ? 30 : 0) +
        (recipe.mealType.some(t => target.mealType.includes(t)) ? 20 : 0) +
        (Math.abs(recipe.calories - target.calories) < 100 ? 15 : 0) +
        (recipe.difficulty === target.difficulty ? 5 : 0)
      )
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, count)
    .map(s => s.recipe);
};

export const analyzeDietBalance = (): {
  score: number;
  feedback: string[];
  suggestions: string[];
} => {
  const weekNutrition = getWeekNutrition();
  const records = getMealRecords();
  
  const feedback: string[] = [];
  const suggestions: string[] = [];
  let score = 100;
  
  const daysWithRecords = weekNutrition.filter(d => d.totalCalories > 0).length;
  if (daysWithRecords < 5) {
    score -= 20;
    feedback.push('本周记录天数较少');
    suggestions.push('建议每天记录饮食，以便更好地分析营养摄入');
  }
  
  const avgCalories = weekNutrition.reduce((sum, d) => sum + d.totalCalories, 0) / 7;
  if (avgCalories < 1200) {
    score -= 15;
    feedback.push('平均热量摄入偏低');
    suggestions.push('建议适当增加热量摄入，保证身体能量需求');
  } else if (avgCalories > 2800) {
    score -= 15;
    feedback.push('平均热量摄入偏高');
    suggestions.push('建议减少高热量食物的摄入');
  }
  
  const avgProtein = weekNutrition.reduce((sum, d) => sum + d.totalProtein, 0) / 7;
  if (avgProtein < 50) {
    score -= 15;
    feedback.push('蛋白质摄入不足');
    suggestions.push('建议增加优质蛋白质摄入，如鸡胸肉、鱼、豆腐等');
  }
  
  const mealTypeCounts: Record<string, number> = {};
  records.slice(-7).forEach(r => {
    mealTypeCounts[r.mealType] = (mealTypeCounts[r.mealType] || 0) + 1;
  });
  
  if (!mealTypeCounts.breakfast || mealTypeCounts.breakfast < 3) {
    score -= 10;
    feedback.push('早餐记录不足');
    suggestions.push('建议坚持吃早餐，开启健康的一天');
  }
  
  return {
    score: Math.max(0, score),
    feedback,
    suggestions
  };
};
