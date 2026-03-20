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

export interface FoodNutritionInfo {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  vitamins: string[];
  minerals: string[];
  healthBenefits: string;
  cautions: string;
}

export async function searchFoodNutrition(foodName: string): Promise<FoodNutritionInfo | null> {
  if (!DEEPSEEK_API_KEY) {
    return getLocalFoodNutrition(foodName);
  }

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
            content: '你是一个专业的营养顾问。请根据食物名称提供详细的营养信息。只需返回JSON格式，不要有其他文字。格式：{"name":"食物名","calories":数字,"protein":数字,"carbs":数字,"fat":数字,"fiber":数字,"vitamins":["维生素A","维生素C"...]],"minerals":["铁","钙"...]],"healthBenefits":"健康功效描述","cautions":"注意事项"}'
          },
          {
            role: 'user',
            content: `请提供${foodName}的营养信息（每100克）`
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    return parseNutritionResponse(content, foodName);
  } catch (error) {
    console.error('DeepSeek nutrition search error:', error);
    return getLocalFoodNutrition(foodName);
  }
}

function parseNutritionResponse(content: string, foodName: string): FoodNutritionInfo | null {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const info = JSON.parse(jsonMatch[0]);
      return {
        name: info.name || foodName,
        calories: info.calories || 0,
        protein: info.protein || 0,
        carbs: info.carbs || 0,
        fat: info.fat || 0,
        fiber: info.fiber || 0,
        vitamins: info.vitamins || [],
        minerals: info.minerals || [],
        healthBenefits: info.healthBenefits || '',
        cautions: info.cautions || ''
      };
    }
  } catch (e) {
    console.error('Failed to parse nutrition response:', e);
  }

  const localInfo = getLocalFoodNutrition(foodName);
  return localInfo;
}

function getLocalFoodNutrition(foodName: string): FoodNutritionInfo | null {
  const localFoods: Record<string, FoodNutritionInfo> = {
    '苹果': { name: '苹果', calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, vitamins: ['维生素C', '维生素B1'], minerals: ['钾', '钙'], healthBenefits: '富含膳食纤维，有助消化', cautions: '糖尿病患者慎食' },
    '香蕉': { name: '香蕉', calories: 89, protein: 1.1, carbs: 23, fat: 0.2, fiber: 2.6, vitamins: ['维生素B6', '维生素C'], minerals: ['钾', '镁'], healthBenefits: '补充能量，促进肠道蠕动', cautions: '肾功能不全者慎食' },
    '鸡胸肉': { name: '鸡胸肉', calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, vitamins: ['维生素B6', '维生素B12'], minerals: ['磷', '硒'], healthBenefits: '高蛋白低脂肪，健身首选', cautions: '痛风患者慎食' },
    '鸡蛋': { name: '鸡蛋', calories: 144, protein: 13, carbs: 1.1, fat: 11, fiber: 0, vitamins: ['维生素A', '维生素D', '维生素B12'], minerals: ['铁', '锌', '硒'], healthBenefits: '营养全面，富含优质蛋白', cautions: '胆固醇高者少吃' },
    '米饭': { name: '米饭', calories: 116, protein: 2.6, carbs: 26, fat: 0.3, fiber: 0.3, vitamins: ['维生素B1'], minerals: ['钾', '镁'], healthBenefits: '提供碳水化合物能量', cautions: '糖尿病患者控制用量' },
    '西红柿': { name: '西红柿', calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2, vitamins: ['维生素C', '维生素E'], minerals: ['钾', '镁'], healthBenefits: '抗氧化，美容养颜', cautions: '胃酸过多者少食' },
    '青菜': { name: '青菜', calories: 14, protein: 1.5, carbs: 2.2, fat: 0.3, fiber: 2.8, vitamins: ['维生素C', '维生素K'], minerals: ['钙', '铁'], healthBenefits: '富含维生素和膳食纤维', cautions: '肾结石患者少食' },
    '牛奶': { name: '牛奶', calories: 54, protein: 3, carbs: 3.4, fat: 3.2, fiber: 0, vitamins: ['维生素A', '维生素D'], minerals: ['钙', '磷'], healthBenefits: '补钙，促进骨骼健康', cautions: '乳糖不耐受者慎食' },
    '豆腐': { name: '豆腐', calories: 81, protein: 8, carbs: 2, fat: 4.2, fiber: 0.4, vitamins: ['维生素B1'], minerals: ['钙', '铁'], healthBenefits: '植物蛋白，有助降低胆固醇', cautions: '痛风患者慎食' },
    '牛肉': { name: '牛肉', calories: 250, protein: 26, carbs: 0, fat: 15, fiber: 0, vitamins: ['维生素B12', '维生素B6'], minerals: ['铁', '锌', '磷'], healthBenefits: '补铁，增强免疫力', cautions: '胆固醇高者少吃' },
    '鱼肉': { name: '鱼肉', calories: 90, protein: 20, carbs: 0, fat: 2, fiber: 0, vitamins: ['维生素D', '维生素B12'], minerals: ['硒', '磷'], healthBenefits: '高蛋白低脂肪，益智健脑', cautions: '过敏体质者慎食' },
    '红薯': { name: '红薯', calories: 99, protein: 1.1, carbs: 24, fat: 0.1, fiber: 3, vitamins: ['维生素A', '维生素C'], minerals: ['钾', '铁'], healthBenefits: '膳食纤维丰富，预防便秘', cautions: '胃酸过多者少食' },
    '菠菜': { name: '菠菜', calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, vitamins: ['维生素A', '维生素C', '维生素K'], minerals: ['铁', '钙'], healthBenefits: '补铁养血，富含叶酸', cautions: '肾结石患者少食' },
    '胡萝卜': { name: '胡萝卜', calories: 35, protein: 0.9, carbs: 8, fat: 0.2, fiber: 2.8, vitamins: ['维生素A', '维生素K'], minerals: ['钾', '钙'], healthBenefits: '护眼明目，增强免疫', cautions: '不宜与酒精同食' },
    '西兰花': { name: '西兰花', calories: 34, protein: 2.8, carbs: 6.6, fat: 0.4, fiber: 2.6, vitamins: ['维生素C', '维生素K'], minerals: ['钙', '钾'], healthBenefits: '抗癌蔬菜，富含抗氧化剂', cautions: '甲状腺功能低下者少食' },
    '橙子': { name: '橙子', calories: 47, protein: 0.9, carbs: 12, fat: 0.1, fiber: 2.4, vitamins: ['维生素C', '维生素B1'], minerals: ['钾', '钙'], healthBenefits: '补充维生素C，增强免疫', cautions: '胃酸过多者少食' },
    '酸奶': { name: '酸奶', calories: 72, protein: 2.9, carbs: 9, fat: 2.7, fiber: 0, vitamins: ['维生素B2', '维生素B12'], minerals: ['钙', '磷'], healthBenefits: '助消化，调节肠道菌群', cautions: '乳糖不耐受者慎食' },
    '燕麦': { name: '燕麦', calories: 389, protein: 17, carbs: 66, fat: 7, fiber: 11, vitamins: ['维生素B1', '维生素E'], minerals: ['铁', '锌'], healthBenefits: '降低胆固醇，稳血糖', cautions: '胃酸过多者少食' },
    '坚果': { name: '坚果', calories: 600, protein: 20, carbs: 15, fat: 50, fiber: 8, vitamins: ['维生素E', '维生素B族'], minerals: ['镁', '铜'], healthBenefits: '健脑益智，保护心血管', cautions: '热量较高，控制摄入量' },
    '猕猴桃': { name: '猕猴桃', calories: 61, protein: 1.1, carbs: 15, fat: 0.5, fiber: 3, vitamins: ['维生素C', '维生素E'], minerals: ['钾', '钙'], healthBenefits: '维C之王，美白养颜', cautions: '胃酸过多者少食' },
  };

  const lowerName = foodName.toLowerCase();
  for (const [name, info] of Object.entries(localFoods)) {
    if (lowerName.includes(name) || name.includes(lowerName)) {
      return info;
    }
  }

  return {
    name: foodName,
    calories: 50,
    protein: 1,
    carbs: 10,
    fat: 0.5,
    fiber: 1,
    vitamins: ['维生素C'],
    minerals: ['钾'],
    healthBenefits: '营养丰富',
    cautions: '适量食用'
  };
}

export async function getMoreFoodRecommendations(
  _preferences: UserPreferences,
  foodCategory?: string
): Promise<FoodNutritionInfo[]> {
  if (!DEEPSEEK_API_KEY) {
    return getLocalFoodsByCategory(foodCategory);
  }

  try {
    const apiUrl = USE_PROXY ? '/api/deepseek' : 'https://api.deepseek.com/v1/chat/completions';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const categoryPrompt = foodCategory ? `请推荐${foodCategory}类别的健康食物，包括蔬菜、水果、主食、蛋白质来源等。` : '请推荐各类别的健康食物，包括蔬菜、水果、主食、蛋白质来源等。';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一个专业的营养顾问。请推荐健康食物并提供简要营养信息。只需返回JSON格式数组，不要有其他文字。格式：[{"name":"食物名","calories":数字,"protein":数字,"carbs":数字,"fat":数字,"fiber":数字,"healthBenefits":"健康功效"}]'
          },
          {
            role: 'user',
            content: categoryPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    return parseFoodListResponse(content);
  } catch (error) {
    console.error('DeepSeek food recommendations error:', error);
    return getLocalFoodsByCategory(foodCategory);
  }
}

function parseFoodListResponse(content: string): FoodNutritionInfo[] {
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const foods = JSON.parse(jsonMatch[0]);
      return foods.map((f: any) => ({
        name: f.name || '',
        calories: f.calories || 0,
        protein: f.protein || 0,
        carbs: f.carbs || 0,
        fat: f.fat || 0,
        fiber: f.fiber || 0,
        vitamins: [],
        minerals: [],
        healthBenefits: f.healthBenefits || '',
        cautions: ''
      }));
    }
  } catch (e) {
    console.error('Failed to parse food list response:', e);
  }

  return getLocalFoodsByCategory(undefined);
}

function getLocalFoodsByCategory(category?: string): FoodNutritionInfo[] {
  const allFoods: FoodNutritionInfo[] = [
    { name: '苹果', calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, vitamins: ['维生素C'], minerals: ['钾'], healthBenefits: '助消化', cautions: '糖尿病慎食' },
    { name: '香蕉', calories: 89, protein: 1.1, carbs: 23, fat: 0.2, fiber: 2.6, vitamins: ['维生素B6'], minerals: ['钾'], healthBenefits: '补充能量', cautions: '肾病患者慎食' },
    { name: '西兰花', calories: 34, protein: 2.8, carbs: 6.6, fat: 0.4, fiber: 2.6, vitamins: ['维生素C'], minerals: ['钙'], healthBenefits: '抗癌', cautions: '甲减患者少食' },
    { name: '鸡胸肉', calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, vitamins: ['维生素B6'], minerals: ['磷'], healthBenefits: '高蛋白', cautions: '痛风患者慎食' },
    { name: '糙米', calories: 111, protein: 2.6, carbs: 23, fat: 0.9, fiber: 1.8, vitamins: ['维生素B1'], minerals: ['镁'], healthBenefits: '稳血糖', cautions: '消化不良者少食' },
    { name: '三文鱼', calories: 208, protein: 20, carbs: 0, fat: 13, fiber: 0, vitamins: ['维生素D'], minerals: ['硒'], healthBenefits: '护心健脑', cautions: '过敏体质慎食' },
    { name: '菠菜', calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, vitamins: ['维生素A'], minerals: ['铁'], healthBenefits: '补铁', cautions: '肾结石患者少食' },
    { name: '牛油果', calories: 160, protein: 2, carbs: 9, fat: 15, fiber: 7, vitamins: ['维生素E'], minerals: ['钾'], healthBenefits: '护心', cautions: '热量较高' },
    { name: '红薯', calories: 99, protein: 1.1, carbs: 24, fat: 0.1, fiber: 3, vitamins: ['维生素A'], minerals: ['钾'], healthBenefits: '通便', cautions: '胃酸多者少食' },
    { name: '杏仁', calories: 579, protein: 21, carbs: 22, fat: 50, fiber: 12, vitamins: ['维生素E'], minerals: ['镁'], healthBenefits: '健脑', cautions: '热量高' },
    { name: '鸡蛋', calories: 144, protein: 13, carbs: 1.1, fat: 11, fiber: 0, vitamins: ['维生素A'], minerals: ['铁'], healthBenefits: '优质蛋白', cautions: '胆固醇高者少吃' },
    { name: '豆腐', calories: 81, protein: 8, carbs: 2, fat: 4.2, fiber: 0.4, vitamins: ['维生素B1'], minerals: ['钙'], healthBenefits: '植物蛋白', cautions: '痛风患者慎食' },
    { name: '蓝莓', calories: 57, protein: 0.7, carbs: 14, fat: 0.3, fiber: 2.4, vitamins: ['维生素C'], minerals: ['锰'], healthBenefits: '抗氧化', cautions: '血糖高者控制' },
    { name: '胡萝卜', calories: 35, protein: 0.9, carbs: 8, fat: 0.2, fiber: 2.8, vitamins: ['维生素A'], minerals: ['钾'], healthBenefits: '护眼', cautions: '不宜与酒同食' },
    { name: '橙子', calories: 47, protein: 0.9, carbs: 12, fat: 0.1, fiber: 2.4, vitamins: ['维生素C'], minerals: ['钾'], healthBenefits: '增强免疫', cautions: '胃酸多者少食' },
    { name: '酸奶', calories: 72, protein: 2.9, carbs: 9, fat: 2.7, fiber: 0, vitamins: ['维生素B2'], minerals: ['钙'], healthBenefits: '助消化', cautions: '乳糖不耐受者慎食' },
    { name: '燕麦', calories: 389, protein: 17, carbs: 66, fat: 7, fiber: 11, vitamins: ['维生素B1'], minerals: ['铁'], healthBenefits: '降胆固醇', cautions: '胃酸多者少食' },
    { name: '核桃', calories: 654, protein: 15, carbs: 14, fat: 65, fiber: 7, vitamins: ['维生素E'], minerals: ['铜'], healthBenefits: '健脑护心', cautions: '热量较高' },
    { name: '猕猴桃', calories: 61, protein: 1.1, carbs: 15, fat: 0.5, fiber: 3, vitamins: ['维生素C'], minerals: ['钾'], healthBenefits: '美白养颜', cautions: '胃酸多者少食' },
    { name: '西红柿', calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2, vitamins: ['维生素C'], minerals: ['钾'], healthBenefits: '抗氧化', cautions: '胃酸多者少食' },
  ];

  if (!category) {
    return allFoods;
  }

  const categoryLower = category.toLowerCase();
  return allFoods.filter(food => {
    const fruitCategories = ['苹果', '香蕉', '橙子', '蓝莓', '猕猴桃', '牛油果'];
    const vegCategories = ['西兰花', '菠菜', '胡萝卜', '西红柿'];
    const proteinCategories = ['鸡胸肉', '三文鱼', '鸡蛋', '豆腐'];
    const grainCategories = ['糙米', '燕麦', '红薯'];
    const nutCategories = ['杏仁', '核桃'];

    if (categoryLower.includes('水果') || categoryLower.includes('fruit')) {
      return fruitCategories.includes(food.name);
    }
    if (categoryLower.includes('蔬菜') || categoryLower.includes('veg')) {
      return vegCategories.includes(food.name);
    }
    if (categoryLower.includes('蛋白') || categoryLower.includes('protein')) {
      return proteinCategories.includes(food.name);
    }
    if (categoryLower.includes('主食') || categoryLower.includes('grain')) {
      return grainCategories.includes(food.name);
    }
    if (categoryLower.includes('坚果') || categoryLower.includes('nut')) {
      return nutCategories.includes(food.name);
    }

    return true;
  });
}
