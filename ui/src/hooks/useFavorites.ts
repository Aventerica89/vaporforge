import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { favoritesApi } from '@/lib/api';

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
  syncing: boolean;
  migrated: boolean;

  addFavorite: (repo: FavoriteRepo) => void;
  removeFavorite: (url: string) => void;
  toggleFavorite: (repo: FavoriteRepo) => void;
  addRecent: (repo: FavoriteRepo) => void;
  isFavorite: (url: string) => boolean;

  // Backend sync
  loadFromBackend: () => Promise<void>;
  syncToBackend: () => Promise<void>;
}

function loadRecents(): FavoriteRepo[] {
  try {
    const stored = localStorage.getItem(RECENTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Debounced sync helper
let favSyncTimeout: ReturnType<typeof setTimeout> | null = null;
function debouncedFavSync(fn: () => Promise<void>, delay = 1000) {
  if (favSyncTimeout) clearTimeout(favSyncTimeout);
  favSyncTimeout = setTimeout(() => {
    fn().catch(console.error);
  }, delay);
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      recents: loadRecents(),
      syncing: false,
      migrated: false,

      addFavorite: (repo) => {
        set((state) => {
          if (state.favorites.some((f) => f.url === repo.url)) return state;
          return { favorites: [...state.favorites, repo] };
        });
        debouncedFavSync(() => get().syncToBackend());
      },

      removeFavorite: (url) => {
        set((state) => ({
          favorites: state.favorites.filter((f) => f.url !== url),
        }));
        debouncedFavSync(() => get().syncToBackend());
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

      // Load favorites from backend
      loadFromBackend: async () => {
        try {
          set({ syncing: true });
          const response = await favoritesApi.list();

          if (response.success && response.data) {
            set({
              favorites: response.data.favorites || [],
              migrated: true,
            });
          }
        } catch (error) {
          console.error('[Favorites] Failed to load from backend:', error);
        } finally {
          set({ syncing: false });
        }
      },

      // Save favorites to backend
      syncToBackend: async () => {
        const { favorites, syncing } = get();
        if (syncing) return;

        try {
          set({ syncing: true });
          await favoritesApi.save(favorites);
        } catch (error) {
          console.error('[Favorites] Failed to sync to backend:', error);
        } finally {
          set({ syncing: false });
        }
      },
    }),
    {
      name: 'vf-favorites',
      partialize: (state) => ({
        favorites: state.favorites,
        migrated: state.migrated,
      }),
    }
  )
);

// Auto-load and migrate on app start
if (typeof window !== 'undefined') {
  useFavoritesStore.getState().loadFromBackend().then(() => {
    const current = useFavoritesStore.getState();

    // Backend had data — it's the source of truth
    if (current.favorites.length > 0) return;

    // Backend is empty — check old localStorage for migration
    const localData = localStorage.getItem('vf_favorite_repos');
    if (!localData || current.migrated) return;

    try {
      const parsed: FavoriteRepo[] = JSON.parse(localData);
      if (parsed.length > 0) {
        console.log('[Favorites] Migrating localStorage data to backend...');
        useFavoritesStore.setState({ favorites: parsed });
        useFavoritesStore.getState().syncToBackend().then(() => {
          console.log('[Favorites] Migration complete!');
          useFavoritesStore.setState({ migrated: true });
        });
      }
    } catch (error) {
      console.error('[Favorites] Migration failed:', error);
    }
  });
}
