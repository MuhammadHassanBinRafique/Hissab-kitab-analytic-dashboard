import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

// Runs `fetcher` whenever `deps` change. Old data stays on screen while reloading.
export default function useApi(fetcher, deps) {
  const { signOut } = useAuth();
  const [state, setState] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    let off = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcher()
      .then((data) => !off && setState({ data, loading: false, error: null }))
      .catch((err) => {
        if (off) return;
        if (err.status === 401) return signOut(); // session expired -> back to the login page
        setState((s) => ({ ...s, loading: false, error: err.message }));
      });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
