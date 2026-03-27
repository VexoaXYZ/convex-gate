import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Check, Trash2, Plus, Loader2 } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";

const useCreateTodo = () =>
  useMutation(api.todos.create).withOptimisticUpdate((localStore, args) => {
    const todos = localStore.getQuery(api.todos.get);
    if (!todos) return;
    const user = localStore.getQuery(api.auth.getCurrentUser);
    if (!user) return;
    localStore.setQuery(api.todos.get, {}, [
      {
        _id: crypto.randomUUID() as Id<"todos">,
        _creationTime: Date.now(),
        text: args.text,
        completed: false,
        userId: user._id as string,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      ...todos,
    ]);
  });

const useToggleTodo = () =>
  useMutation(api.todos.toggle).withOptimisticUpdate((localStore, args) => {
    const todos = localStore.getQuery(api.todos.get);
    if (!todos) return;
    const idx = todos.findIndex((t) => t._id === args.id);
    if (idx === -1) return;
    localStore.setQuery(
      api.todos.get,
      {},
      todos.toSpliced(idx, 1, { ...todos[idx], completed: !todos[idx].completed })
    );
  });

const useRemoveTodo = () =>
  useMutation(api.todos.remove).withOptimisticUpdate((localStore, args) => {
    const todos = localStore.getQuery(api.todos.get);
    if (!todos) return;
    const idx = todos.findIndex((t) => t._id === args.id);
    if (idx === -1) return;
    localStore.setQuery(api.todos.get, {}, todos.toSpliced(idx, 1));
  });

export function TodoList() {
  const todos = useQuery(api.todos.get);
  const create = useCreateTodo();
  const toggle = useToggleTodo();
  const remove = useRemoveTodo();
  const [newTodo, setNewTodo] = useState("");

  if (!todos) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 size={16} className="text-[var(--text-faint)] animate-spin" />
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newTodo.trim();
    if (!text) return;
    create({ text });
    setNewTodo("");
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-[700] text-[var(--text)]">Tasks</h3>
        {todos.length > 0 && (
          <span className="text-[11px] text-[var(--text-faint)] tabular-nums">
            {todos.filter((t) => t.completed).length}/{todos.length} done
          </span>
        )}
      </div>

      {/* Add form */}
      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="Add a new task..."
          className="flex-1 h-10 px-3.5 text-[13px] bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder:text-[var(--text-faint)] transition-colors focus:border-[var(--border-light)] focus:bg-[var(--bg-hover)]"
        />
        <button
          type="submit"
          disabled={!newTodo.trim()}
          className="h-10 w-10 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-muted)] flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <Plus size={16} />
        </button>
      </form>

      {/* List */}
      <div className="space-y-0.5">
        {todos.map((todo) => (
          <div
            key={todo._id}
            className="group flex items-center gap-3 px-3 py-2.5 -mx-3 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
          >
            {/* Checkbox */}
            <button
              onClick={() => toggle({ id: todo._id })}
              className={`shrink-0 w-[18px] h-[18px] rounded border flex items-center justify-center transition-colors cursor-pointer ${
                todo.completed
                  ? "bg-[var(--accent)] border-[var(--accent)] text-black"
                  : "border-[var(--border-light)] hover:border-[var(--text-muted)]"
              }`}
            >
              {todo.completed && <Check size={11} strokeWidth={3} />}
            </button>

            {/* Text */}
            <span
              className={`flex-1 text-[13px] transition-colors ${
                todo.completed
                  ? "line-through text-[var(--text-faint)]"
                  : "text-[var(--text)]"
              }`}
            >
              {todo.text}
            </span>

            {/* Delete */}
            <button
              onClick={() => remove({ id: todo._id })}
              className="shrink-0 p-1 rounded text-[var(--text-faint)] opacity-0 group-hover:opacity-100 transition-all hover:text-[var(--danger)] cursor-pointer"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Empty */}
      {todos.length === 0 && (
        <p className="text-center py-10 text-[13px] text-[var(--text-faint)]">
          No tasks yet. Add one above.
        </p>
      )}
    </div>
  );
}
