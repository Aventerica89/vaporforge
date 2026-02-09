import { create } from 'zustand';

const STORAGE_KEY = 'vf_favorite_repos';
const RECENTS_KEY = 'vf_recent_repos';

export interface FavoriteRepo {
  url: string;
  name: string;
  owner: string;
  description?: string;
}

interface FavoritesState {
  favorites: FavoriteRepo[];
  recents: FavoriteRepo[];
  addFavorite: (repo: FavoriteRepo) => void;
  removeFavorite: (url: string) => void;
  toggleFavorite: (repo: FavoriteRepo) => void;
  addRecent: (repo: FavoriteRepo) => void;
  isFavorite: (url: string) => boolean;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favorites: loadFromStorage<FavoriteRepo[]>(STORAGE_KEY, []),
  recents: loadFromStorage<FavoriteRepo[]>(RECENTS_KEY, []),

  addFavorite: (repo) => {
    set((state) => {
      if (state.favorites.some((f) => f.url === repo.url)) return state;
      const updated = [...state.favorites, repo];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return { favorites: updated };
    });
  },

  removeFavorite: (url) => {
    set((state) => {
      const updated = state.favorites.filter((f) => f.url !== url);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return { favorites: updated };
    });
  },

  toggleFavorite: (repo) => {
    if (get().isFavorite(repo.url)) {
      get().removeFavorite(repo.url);
    } else {
      get().addFavorite(repo);
    }
  },

  addRecent: (repo) => {
    set((state) => {
      const filtered = state.recents.filter((r) => r.url !== repo.url);
      const updated = [repo, ...filtered].slice(0, 20);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
      return { recents: updated };
    });
  },

  isFavorite: (url) => get().favorites.some((f) => f.url === url),
}));
