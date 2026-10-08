import { useState } from "react";
import "./style.css";

export function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="app">
      <h1>React JavaScript Starter</h1>
      <p>Start editing to build your application.</p>

      <button onClick={() => setCount(count + 1)}>
        Count: {count}
      </button>
    </div>
  );
}
