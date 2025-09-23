import { useState, useEffect, useRef, HTMLProps } from 'react';

type Data = [string, string, string][];
interface EditableMatrix3x3Props extends HTMLProps<HTMLDivElement> {
  initialMatrix?: Data;
  onMatrixChange?: (x: Data) => unknown;
}
export function EditableMatrix3x3({
  initialMatrix,
  onMatrixChange,
  className = 'max-w-sm mx-auto',
}: EditableMatrix3x3Props) {
  // default 3x3
  const defaultMatrix: Data =
    initialMatrix && initialMatrix.length === 3
      ? initialMatrix
      : [
          ['', '', ''],
          ['', '', ''],
          ['', '', ''],
        ];

  const [matrix, setMatrix] = useState<Data>(defaultMatrix);
  const tableRef = useRef<HTMLTableElement | null>(null);

  useEffect(() => {
    // уведомляем родителя при изменениях
    onMatrixChange && onMatrixChange(matrix);
  }, [matrix, onMatrixChange]);

  // Обработчик делегированный — принимает input от contentEditable <td>
  const handleInput = (e: React.FormEvent<HTMLTableElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // мы ожидаем, что event пришёл от <td data-row data-col>
    const td = target.closest && (target.closest('td') as HTMLElement | null);
    if (!td) return;

    const row = Number(td.dataset.row);
    const col = Number(td.dataset.col);
    if (Number.isNaN(row) || Number.isNaN(col)) return;

    const raw = td.innerText;

    setMatrix((prev) => {
      const copy = prev.map((r) => r.slice()) as Data;
      copy[row][col] = raw;
      return copy;
    });
  };

  // Перемещение фокуса по Enter/Tab — тоже делегируем на таблицу
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTableElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const td = target.closest && (target.closest('td') as HTMLElement | null);
    if (!td) return;

    const orderAttr = td.dataset.order;
    if (orderAttr == null) return;

    const order = Number(orderAttr);
    if (Number.isNaN(order)) return;

    // Enter/Tab — переходим к следующей ячейке. Shift+Tab — в обратную.
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();

      const forward = !e.shiftKey;
      const nextOrder = forward ? (order + 1) % 9 : (order + 8) % 9; // wrap around

      const next = tableRef.current?.querySelector(
        `[data-order="${nextOrder}"]`
      ) as HTMLElement | null;
      if (next) {
        // убедимся, что элемент фокусируем
        next.focus();

        // поставить каретку в конец содержимого
        try {
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(next);
          range.collapse(false);
          sel && (sel.removeAllRanges(), sel.addRange(range));
        } catch (err) {
          // silent
        }
      }
    }
  };

  const getOrderIndex = (row: number, col: number) => row * 3 + col; // 0..8

  return (
    <div className={className}>
      <div className="text-sm mb-2 text-gray-700">
        Editable 3×3 matrix — единый обработчик ввода (contentEditable)
      </div>
      <table
        ref={tableRef}
        className="w-full table-auto border-collapse"
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        aria-label="Editable 3 by 3 matrix"
        role="grid"
      >
        <tbody>
          {matrix.map((rowArr, r) => (
            <tr key={r}>
              {rowArr.map((cell, c) => (
                <td
                  // contentEditable ячейки — теперь делегируем обработку
                  contentEditable
                  key={c}
                  className="border p-1"
                  role="gridcell"
                  aria-label={`cell-${r}-${c}`}
                  data-row={r}
                  data-col={c}
                  data-order={getOrderIndex(r, c)}
                  tabIndex={0} // делаем td фокусируемым
                  suppressContentEditableWarning // React предупреждение
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 text-xs text-gray-600">
        Подсказка: каждая ячейка имеет <code>data-row</code>,{' '}
        <code>data-col</code> и <code>data-order</code>.
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onMatrixChange?.(matrix)}
          className="px-3 py-1 rounded-md shadow-sm border"
        >
          Emit
        </button>

        <button
          onClick={() =>
            setMatrix([
              ['', '', ''],
              ['', '', ''],
              ['', '', ''],
            ])
          }
          className="px-3 py-1 rounded-md shadow-sm border"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
