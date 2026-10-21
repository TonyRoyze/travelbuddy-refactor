import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "@/features/auth/session";
import { cartStorageKey, putCartItem, readCart, type CartItem } from "./cart";

type Cart = {
  items: CartItem[];
  storageError: boolean;
  put: (item: CartItem) => void;
  remove: (ids: string[]) => void;
};
const Context = createContext<Cart | null>(null);
export function CartProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  return (
    <CartStore key={session?.user.id ?? "guest"} userId={session?.user.id}>
      {children}
    </CartStore>
  );
}
function CartStore({
  userId,
  children,
}: {
  userId?: string;
  children: ReactNode;
}) {
  const [initial] = useState(() => {
    try {
      return {
        items: userId
          ? readCart(localStorage.getItem(cartStorageKey(userId)))
          : [],
        storageError: false,
      };
    } catch {
      return { items: [] as CartItem[], storageError: true };
    }
  });
  const [items, setItems] = useState(initial.items);
  const current = useRef(items);
  const [storageError, setStorageError] = useState(initial.storageError);
  function commit(next: CartItem[]) {
    current.current = next;
    setItems(next);
    try {
      if (userId)
        localStorage.setItem(cartStorageKey(userId), JSON.stringify(next));
    } catch {
      setStorageError(true);
    }
  }
  return (
    <Context.Provider
      value={{
        items,
        storageError,
        put: (item) => {
          if (!userId)
            throw new Error("Sign in to add a booking to your cart.");
          commit(putCartItem(current.current, item));
        },
        remove: (ids) =>
          commit(current.current.filter((item) => !ids.includes(item.id))),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useCart() {
  const cart = useContext(Context);
  if (!cart) throw new Error("CartProvider is required.");
  return cart;
}
