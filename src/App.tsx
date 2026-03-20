import { useState, useEffect, createContext, useContext } from 'react';
import { UserPreferences, FoodItem } from './types';
import { getPreferences, savePreferences, getDefaultPreferences, getMealRecords, saveMealRecord, getFavorites, toggleFavorite, getTodayMeals } from './utils/storage';
import { getQuickRecommendations } from './utils/recommendations';
import { getDeepSeekRecommendations, getFallbackRecommendations, searchFoodNutrition, getMoreFoodRecommendations, FoodNutritionInfo } from './utils/deepseek';
import { searchFoods } from './data/foods';
import { recipes, getRecipeById } from './data/recipes';
import { 
  ChevronLeft, Plus, Home, User, Search, X, Heart, Flame, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AppContextType {
  preferences: UserPreferences;
  updatePreferences: (prefs: Partial<UserPreferences>) => void;
}

const AppContext = createContext<AppContextType>({
  preferences: getDefaultPreferences(),
  updatePreferences: () => {}
});

export const useAppContext = () => useContext(AppContext);

function App() {
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    return getPreferences() || getDefaultPreferences();
  });
  const [activeTab, setActiveTab] = useState('home');
  const [view, setView] = useState<'home' | 'detail' | 'me'>('home');
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null);
  const [showRecord, setShowRecord] = useState(false);

  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  const updatePreferences = (prefs: Partial<UserPreferences>) => {
    setPreferences(prev => ({
      ...prev,
      ...prefs,
      updatedAt: new Date().toISOString()
    }));
  };

  const openRecipe = (id: string) => {
    setSelectedRecipe(id);
    setView('detail');
  };

  return (
    <AppContext.Provider value={{ preferences, updatePreferences }}>
      <div className="app-container">
        <div className="phone-frame">
          <AnimatePresence mode="wait">
            {view === 'home' && (
              <motion.div
                key="home"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="screen"
              >
                <HomeScreen 
                  onOpenRecipe={openRecipe} 
                  showRecord={showRecord}
                  setShowRecord={setShowRecord}
                />
                <BottomNav 
                  activeTab={activeTab} 
                  setActiveTab={setActiveTab} 
                  onMeClick={() => setView('me')} 
                  onAddClick={() => setShowRecord(true)}
                />
              </motion.div>
            )}
            {view === 'detail' && selectedRecipe && (
              <motion.div
                key="detail"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="screen"
              >
                <RecipeDetailScreen 
                  recipeId={selectedRecipe} 
                  onBack={() => setView('home')} 
                />
              </motion.div>
            )}
            {view === 'me' && (
              <motion.div
                key="me"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="screen"
              >
                <MeScreen onBack={() => setView('home')} />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="home-indicator" />
        </div>
      </div>
    </AppContext.Provider>
  );
}

function BottomNav({ activeTab, setActiveTab, onMeClick, onAddClick }: { 
  activeTab: string; 
  setActiveTab: (t: string) => void;
  onMeClick: () => void;
  onAddClick: () => void;
}) {
  return (
    <nav className="bottom-nav simple">
      <button 
        onClick={() => setActiveTab('home')}
        className={`nav-btn ${activeTab === 'home' ? 'active' : ''}`}
      >
        <Home className="w-5 h-5" />
        <span>首页</span>
      </button>
      <button className="nav-btn action" onClick={onAddClick}>
        <Plus className="w-6 h-6" />
      </button>
      <button 
        onClick={onMeClick}
        className={`nav-btn ${activeTab === 'me' ? 'active' : ''}`}
      >
        <User className="w-5 h-5" />
        <span>我的</span>
      </button>
    </nav>
  );
}

function HomeScreen({ onOpenRecipe, showRecord, setShowRecord }: { 
  onOpenRecipe: (id: string) => void;
  showRecord: boolean;
  setShowRecord: (show: boolean) => void;
}) {
  const { preferences } = useAppContext();
  const [quickFlavor, setQuickFlavor] = useState<string>('');
  const [quickCuisine, setQuickCuisine] = useState<string>('');
  const [recKey, setRecKey] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReason, setAiReason] = useState<string>('');
  const [selectedFoodCategory, setSelectedFoodCategory] = useState<string>('');
  const [foodRecommendations, setFoodRecommendations] = useState<FoodNutritionInfo[]>([]);
  const [loadingFoods, setLoadingFoods] = useState(false);
  
  const todayMeals = getTodayMeals();
  const tempPrefs = {
    ...preferences,
    flavors: quickFlavor ? [quickFlavor] : preferences.flavors,
    cuisines: quickCuisine ? [quickCuisine] : preferences.cuisines,
    _seed: recKey
  };
  const quickRecs = getQuickRecommendations(tempPrefs, 3);

  useEffect(() => {
    const fetchDeepSeekRecs = async () => {
      setAiLoading(true);
      try {
        const result = await getDeepSeekRecommendations(preferences, 4);
        setAiReason(result.reason);
      } catch (error) {
        console.error('Failed to get DeepSeek recommendations:', error);
        setAiReason('根据您的偏好推荐');
      } finally {
        setAiLoading(false);
      }
    };

    fetchDeepSeekRecs();
  }, [preferences, recKey]);

  useEffect(() => {
    const fetchFoodRecs = async () => {
      setLoadingFoods(true);
      try {
        const foods = await getMoreFoodRecommendations(preferences, selectedFoodCategory);
        setFoodRecommendations(foods);
      } catch (error) {
        console.error('Failed to get food recommendations:', error);
      } finally {
        setLoadingFoods(false);
      }
    };

    fetchFoodRecs();
  }, [preferences, selectedFoodCategory]);

  const aiRecommendations = aiLoading 
    ? getFallbackRecommendations(preferences, 4).recipes 
    : getFallbackRecommendations(preferences, 4).recipes;

  const todayNutrition = {
    calories: todayMeals.reduce((sum, m) => sum + m.totalCalories, 0),
    protein: todayMeals.reduce((sum, m) => sum + m.totalProtein, 0),
    carbs: todayMeals.reduce((sum, m) => sum + m.totalCarbs, 0),
    fat: todayMeals.reduce((sum, m) => sum + m.totalFat, 0)
  };

  const calorieProgress = Math.min(100, (todayNutrition.calories / preferences.dailyCalorieGoal) * 100);
  const remainingCalories = Math.max(0, preferences.dailyCalorieGoal - todayNutrition.calories);

  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const today = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - 3 + i);
    return {
      day: days[d.getDay()],
      date: d.getDate(),
      active: i === 3
    };
  });

  return (
    <div className="screen-content">
      {/* Header */}
      <header className="screen-header">
        <div>
          <p className="greeting">今天想吃什么？</p>
          <h1 className="title">发现美味健康</h1>
        </div>
        <div className="avatar">
          <span>🥗</span>
        </div>
      </header>

      {/* Calendar Strip */}
      <div className="calendar-strip">
        {weekDays.map((d) => (
          <div key={d.date} className={`calendar-day ${d.active ? 'active' : ''}`}>
            <span className="day-label">{d.day}</span>
            <div className="day-number">{d.date}</div>
          </div>
        ))}
      </div>

      {/* Calorie Card */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="calorie-card"
      >
        <div className="calorie-info">
          <div>
            <p className="calorie-label">今日剩余</p>
            <h2 className="calorie-value">{remainingCalories}</h2>
            <p className="calorie-unit">kcal</p>
          </div>
          <div className="calorie-ring">
            <svg viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="8"/>
              <circle 
                cx="50" cy="50" r="42" 
                fill="none" 
                stroke="white" 
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${calorieProgress * 2.64} 264`}
                transform="rotate(-90 50 50)"
              />
            </svg>
            <div className="ring-text">
              <Flame className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="nutrition-row">
          <div className="nutrition-item">
            <span className="nutrition-dot protein" />
            <span>蛋白质 {todayNutrition.protein.toFixed(0)}g</span>
          </div>
          <div className="nutrition-item">
            <span className="nutrition-dot carbs" />
            <span>碳水 {todayNutrition.carbs.toFixed(0)}g</span>
          </div>
          <div className="nutrition-item">
            <span className="nutrition-dot fat" />
            <span>脂肪 {todayNutrition.fat.toFixed(0)}g</span>
          </div>
        </div>
      </motion.div>

      {/* Quick Recommendations */}
      <div className="section-header">
        <h2>为你推荐</h2>
        <button className="refresh-btn" onClick={() => setRecKey(k => k + 1)}>
          <Clock className="w-4 h-4" />
        </button>
      </div>

      <div className="filter-pills">
        <select 
          className="pill"
          value={quickFlavor} 
          onChange={(e) => { setQuickFlavor(e.target.value); setRecKey(k => k + 1); }}
        >
          <option value="">口味</option>
          <option value="辣">🌶️ 辣</option>
          <option value="清淡">🍃 清淡</option>
          <option value="甜">🍯 甜</option>
          <option value="酸">🍋 酸</option>
          <option value="鲜">🦐 鲜</option>
        </select>
        <select 
          className="pill"
          value={quickCuisine} 
          onChange={(e) => { setQuickCuisine(e.target.value); setRecKey(k => k + 1); }}
        >
          <option value="">菜系</option>
          <option value="川菜">川菜</option>
          <option value="粤菜">粤菜</option>
          <option value="湘菜">湘菜</option>
          <option value="日料">日料</option>
          <option value="西餐">西餐</option>
        </select>
      </div>

      <div className="recipe-cards" key={recKey}>
        {quickRecs.map((recipe, index) => (
          <motion.div
            key={recipe.id}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: index * 0.1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onOpenRecipe(recipe.id)}
            className="recipe-card-large"
            style={{ background: index === 0 ? 'linear-gradient(135deg, #FFB74D 0%, #FF9800 100%)' : 'white' }}
          >
            <div className="recipe-card-content">
              <span className="recipe-emoji">{recipe.image}</span>
              <div>
                <h3 className="recipe-name">{recipe.name}</h3>
                <p className="recipe-meta">{recipe.prepTime}分钟 · {recipe.calories}kcal</p>
              </div>
            </div>
            <div className="recipe-tags-row">
              <span className="tag-small">{recipe.cuisine}</span>
              {recipe.tags.slice(0, 1).map(tag => (
                <span key={tag} className="tag-small">{tag}</span>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {/* AI Recommendations */}
      <div className="section-header">
        <h2>✨ AI智能推荐</h2>
        <span className="section-desc">{aiLoading ? '思考中...' : aiReason}</span>
      </div>

      <div className="recipe-grid-small">
        {aiRecommendations.map((recipe: any, index: number) => (
          <motion.div
            key={recipe.id}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: index * 0.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onOpenRecipe(recipe.id)}
            className="recipe-card-small"
          >
            <div className="recipe-image-bg">{recipe.image}</div>
            <div className="recipe-small-content">
              <h4>{recipe.name}</h4>
              <p>{recipe.calories}kcal</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Food Category Filter */}
      <div className="section-header" style={{ marginTop: 24 }}>
        <h2>🍎 健康食物推荐</h2>
      </div>

      <div className="category-filter">
        {['全部', '水果', '蔬菜', '蛋白质', '主食', '坚果'].map(cat => (
          <button
            key={cat}
            className={selectedFoodCategory === (cat === '全部' ? '' : cat) ? 'active' : ''}
            onClick={() => setSelectedFoodCategory(cat === '全部' ? '' : cat)}
          >
            {cat === '全部' && '🍽️'}
            {cat === '水果' && '🍎'}
            {cat === '蔬菜' && '🥬'}
            {cat === '蛋白质' && '🥩'}
            {cat === '主食' && '🍚'}
            {cat === '坚果' && '🥜'}
            <span>{cat}</span>
          </button>
        ))}
      </div>

      {loadingFoods ? (
        <div className="loading-text">正在加载推荐...</div>
      ) : (
        <div className="food-recommendation-grid">
          {foodRecommendations.map((food, index) => (
            <motion.div
              key={food.name}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: index * 0.05 }}
              className="food-recommendation-card"
            >
              <div className="food-info">
                <h4>{food.name}</h4>
                <p className="food-calories">{food.calories} kcal/100g</p>
                <div className="food-tags">
                  <span className="food-tag protein">蛋白{food.protein}g</span>
                  <span className="food-tag carbs">碳水{food.carbs}g</span>
                  <span className="food-tag fat">脂肪{food.fat}g</span>
                </div>
                {food.healthBenefits && (
                  <p className="food-benefit">✨ {food.healthBenefits}</p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Record Modal */}
      <AnimatePresence>
        {showRecord && <RecordModal onClose={() => setShowRecord(false)} />}
      </AnimatePresence>
    </div>
  );
}

function RecordModal({ onClose }: { onClose: () => void }) {
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch');
  const [foodSearch, setFoodSearch] = useState('');
  const [searchResults, setSearchResults] = useState<FoodItem[]>([]);
  const [selectedFoods, setSelectedFoods] = useState<{ food: FoodItem; servings: number }[]>([]);
  const [nutritionInfo, setNutritionInfo] = useState<FoodNutritionInfo | null>(null);
  const [loadingNutrition, setLoadingNutrition] = useState(false);

  const mealTypes = [
    { id: 'breakfast', label: '早餐', icon: '🌅' },
    { id: 'lunch', label: '午餐', icon: '☀️' },
    { id: 'dinner', label: '晚餐', icon: '🌙' },
    { id: 'snack', label: '零食', icon: '🍪' }
  ] as const;

  const handleSearch = (query: string) => {
    setFoodSearch(query);
    setSearchResults(query.length > 0 ? searchFoods(query).slice(0, 6) : []);

    if (query.length >= 2) {
      setLoadingNutrition(true);
      searchFoodNutrition(query).then(info => {
        setNutritionInfo(info);
        setLoadingNutrition(false);
      }).catch(() => {
        setNutritionInfo(null);
        setLoadingNutrition(false);
      });
    } else {
      setNutritionInfo(null);
    }
  };

  const addFood = (food: FoodItem) => {
    setSelectedFoods([...selectedFoods, { food, servings: 1 }]);
    setFoodSearch('');
    setSearchResults([]);
  };

  const removeFood = (index: number) => {
    setSelectedFoods(selectedFoods.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (selectedFoods.length === 0) return;
    const date = new Date().toISOString().split('T')[0];
    const totals = selectedFoods.reduce((acc, item) => ({
      calories: acc.calories + item.food.calories * item.servings,
      protein: acc.protein + item.food.protein * item.servings,
      carbs: acc.carbs + item.food.carbs * item.servings,
      fat: acc.fat + item.food.fat * item.servings
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    saveMealRecord({
      id: crypto.randomUUID(),
      date,
      mealType,
      foods: selectedFoods.map(item => ({
        ...item.food,
        calories: item.food.calories * item.servings,
        protein: item.food.protein * item.servings,
        carbs: item.food.carbs * item.servings,
        fat: item.food.fat * item.servings,
        servingSize: item.food.servingSize * item.servings
      })),
      totalCalories: totals.calories,
      totalProtein: totals.protein,
      totalCarbs: totals.carbs,
      totalFat: totals.fat
    });
    onClose();
    window.location.reload();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="modal-overlay"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="modal-sheet"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-handle" />
        
        <h3 className="modal-title">记录饮食</h3>

        <div className="meal-selector">
          {mealTypes.map(type => (
            <button
              key={type.id}
              className={mealType === type.id ? 'active' : ''}
              onClick={() => setMealType(type.id)}
            >
              <span>{type.icon}</span>
              <span>{type.label}</span>
            </button>
          ))}
        </div>

        <div className="search-box">
          <Search className="w-5 h-5 text-neutral-400" />
          <input
            type="text"
            placeholder="搜索食物..."
            value={foodSearch}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>

        {searchResults.length > 0 && (
          <div className="search-results-list">
            {searchResults.map(food => (
              <div key={food.id} className="search-result-item" onClick={() => addFood(food)}>
                <span>{food.name}</span>
                <span className="cal">{food.calories}kcal</span>
              </div>
            ))}
          </div>
        )}

        {loadingNutrition && (
          <div className="nutrition-loading">正在获取营养信息...</div>
        )}

        {nutritionInfo && (
          <div className="nutrition-info-card">
            <h4>🥗 {nutritionInfo.name} 营养信息</h4>
            <div className="nutrition-grid">
              <div className="nutrition-item">
                <span className="label">热量</span>
                <span className="value">{nutritionInfo.calories} kcal</span>
              </div>
              <div className="nutrition-item">
                <span className="label">蛋白质</span>
                <span className="value">{nutritionInfo.protein}g</span>
              </div>
              <div className="nutrition-item">
                <span className="label">碳水</span>
                <span className="value">{nutritionInfo.carbs}g</span>
              </div>
              <div className="nutrition-item">
                <span className="label">脂肪</span>
                <span className="value">{nutritionInfo.fat}g</span>
              </div>
              <div className="nutrition-item">
                <span className="label">纤维</span>
                <span className="value">{nutritionInfo.fiber}g</span>
              </div>
            </div>
            {nutritionInfo.vitamins.length > 0 && (
              <div className="nutrition-detail">
                <span>💊 维生素: {nutritionInfo.vitamins.join(', ')}</span>
              </div>
            )}
            {nutritionInfo.minerals.length > 0 && (
              <div className="nutrition-detail">
                <span>⚡ 矿物质: {nutritionInfo.minerals.join(', ')}</span>
              </div>
            )}
            {nutritionInfo.healthBenefits && (
              <div className="nutrition-detail benefit">
                <span>✨ {nutritionInfo.healthBenefits}</span>
              </div>
            )}
            {nutritionInfo.cautions && (
              <div className="nutrition-detail caution">
                <span>⚠️ {nutritionInfo.cautions}</span>
              </div>
            )}
          </div>
        )}

        {selectedFoods.length > 0 && (
          <div className="selected-foods-list">
            {selectedFoods.map((item, index) => (
              <div key={index} className="selected-food-row">
                <span>{item.food.name}</span>
                <div className="servings-control">
                  <button onClick={() => {
                    const newServings = Math.max(0.5, item.servings - 0.5);
                    setSelectedFoods(selectedFoods.map((f, i) => i === index ? { ...f, servings: newServings } : f));
                  }}>-</button>
                  <span>{item.servings}份</span>
                  <button onClick={() => {
                    setSelectedFoods(selectedFoods.map((f, i) => i === index ? { ...f, servings: f.servings + 0.5 } : f));
                  }}>+</button>
                  <button className="remove-btn" onClick={() => removeFood(index)}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button className="save-record-btn" onClick={handleSave} disabled={selectedFoods.length === 0}>
          保存记录
        </button>
      </motion.div>
    </motion.div>
  );
}

function RecipeDetailScreen({ recipeId, onBack }: { recipeId: string; onBack: () => void }) {
  const recipe = getRecipeById(recipeId);
  const favorites = getFavorites();
  const isFavorite = favorites.includes(recipeId);

  if (!recipe) return null;

  return (
    <div className="screen-content detail">
      <header className="detail-header">
        <button onClick={onBack} className="icon-btn">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button 
          className={`icon-btn ${isFavorite ? 'favorite' : ''}`}
          onClick={() => { toggleFavorite(recipe.id); window.location.reload(); }}
        >
          <Heart className="w-6 h-6" fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </header>

      <div className="recipe-hero-detail">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="recipe-emoji-hero"
        >
          {recipe.image}
        </motion.div>
        <h1>{recipe.name}</h1>
        <p>{recipe.cuisine} · {recipe.prepTime}分钟</p>
      </div>

      <div className="nutrition-cards">
        <div className="nutrition-card">
          <span className="value">{recipe.calories}</span>
          <span className="label">kcal</span>
        </div>
        <div className="nutrition-card">
          <span className="value">{recipe.protein}</span>
          <span className="label">蛋白质</span>
        </div>
        <div className="nutrition-card">
          <span className="value">{recipe.carbs}</span>
          <span className="label">碳水</span>
        </div>
        <div className="nutrition-card">
          <span className="value">{recipe.fat}</span>
          <span className="label">脂肪</span>
        </div>
      </div>

      <div className="detail-section">
        <h3>食材</h3>
        <div className="ingredients-cloud">
          {recipe.ingredients.map((ing, i) => (
            <span key={i} className="ingredient-pill">{ing}</span>
          ))}
        </div>
      </div>

      <div className="detail-section">
        <h3>做法步骤</h3>
        <div className="steps-list">
          {recipe.steps.map((step, i) => (
            <div key={i} className="step-item">
              <span className="step-number">{i + 1}</span>
              <p>{step}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MeScreen({ onBack }: { onBack: () => void }) {
  const { preferences, updatePreferences } = useAppContext();
  const [activeTab, setActiveTab] = useState<'settings' | 'records' | 'favorites'>('settings');
  const favorites = getFavorites();
  const favoriteRecipes = recipes.filter(r => favorites.includes(r.id));
  const allRecords = getMealRecords().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const mealTypeLabels = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '零食' };
  const mealTypeIcons = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍪' };

  return (
    <div className="screen-content">
      <header className="screen-header">
        <button onClick={onBack} className="icon-btn">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1>我的</h1>
        <div className="w-10" />
      </header>

      <div className="profile-card">
        <div className="avatar-large">🥗</div>
        <h2>饮食均衡助手</h2>
        <p>已记录 {allRecords.length} 餐 · 收藏 {favorites.length} 道菜</p>
      </div>

      <div className="tabs">
        <button className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}>
          偏好
        </button>
        <button className={activeTab === 'records' ? 'active' : ''} onClick={() => setActiveTab('records')}>
          记录
        </button>
        <button className={activeTab === 'favorites' ? 'active' : ''} onClick={() => setActiveTab('favorites')}>
          收藏
        </button>
      </div>

      {activeTab === 'settings' && (
        <div className="settings-content">
          <div className="setting-group">
            <label>每日热量目标</label>
            <div className="slider-container">
              <input
                type="range"
                min="1200"
                max="4000"
                step="100"
                value={preferences.dailyCalorieGoal}
                onChange={e => updatePreferences({ dailyCalorieGoal: parseInt(e.target.value) })}
              />
              <span>{preferences.dailyCalorieGoal} kcal</span>
            </div>
          </div>

          <div className="setting-group">
            <label>口味偏好</label>
            <div className="option-pills">
              {['辣', '甜', '清淡', '酸', '鲜', '香'].map(f => (
                <button
                  key={f}
                  className={preferences.flavors.includes(f) ? 'active' : ''}
                  onClick={() => {
                    const newFlavors = preferences.flavors.includes(f)
                      ? preferences.flavors.filter(x => x !== f)
                      : [...preferences.flavors, f];
                    updatePreferences({ flavors: newFlavors });
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-group">
            <label>喜欢的菜系</label>
            <div className="option-pills">
              {['川菜', '粤菜', '湘菜', '日料', '西餐', '中餐'].map(c => (
                <button
                  key={c}
                  className={preferences.cuisines.includes(c) ? 'active' : ''}
                  onClick={() => {
                    const newCuisines = preferences.cuisines.includes(c)
                      ? preferences.cuisines.filter(x => x !== c)
                      : [...preferences.cuisines, c];
                    updatePreferences({ cuisines: newCuisines });
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-group">
            <label>过敏原</label>
            <div className="option-pills">
              {['花生', '海鲜', '牛奶', '鸡蛋'].map(a => (
                <button
                  key={a}
                  className={preferences.allergies.includes(a) ? 'active warning' : ''}
                  onClick={() => {
                    const newAllergies = preferences.allergies.includes(a)
                      ? preferences.allergies.filter(x => x !== a)
                      : [...preferences.allergies, a];
                    updatePreferences({ allergies: newAllergies });
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'records' && (
        <div className="records-list">
          {allRecords.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <p>暂无记录</p>
            </div>
          ) : (
            allRecords.map(record => (
              <div key={record.id} className="record-row">
                <div className="record-info">
                  <span className="record-date">{record.date}</span>
                  <span className="record-type">{mealTypeIcons[record.mealType]} {mealTypeLabels[record.mealType]}</span>
                </div>
                <div className="record-foods">{record.foods.map(f => f.name).join('、')}</div>
                <div className="record-cal">{Math.round(record.totalCalories)}kcal</div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'favorites' && (
        <div className="favorites-grid">
          {favoriteRecipes.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">❤️</div>
              <p>暂无收藏</p>
            </div>
          ) : (
            favoriteRecipes.map(recipe => (
              <div key={recipe.id} className="favorite-card" onClick={() => window.location.href = `/recipe/${recipe.id}`}>
                <div className="favorite-emoji">{recipe.image}</div>
                <span>{recipe.name}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default App;
