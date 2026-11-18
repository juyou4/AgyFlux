import { ReactNode, useEffect, useRef } from 'react';

interface SpringAccordionProps {
  open: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * SpringAccordion
 * 完整复刻 E:\ui动效\09-视频复刻组件库-23件套\components\13-手风琴问答-单项展开与高度平滑过渡.html：
 * 外层使用 CSS Grid 0fr -> 1fr 实现零抖动高度弹簧过渡，内层内容同步执行 85ms 延迟的 blur(5px) + 上浮显现，折叠态自动挂载 inert。
 */
export function SpringAccordion({ open, children, className = '' }: SpringAccordionProps) {
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    if (open) {
      el.removeAttribute('inert');
    } else {
      el.setAttribute('inert', '');
    }
  }, [open]);

  return (
    <div className={`drawer-grid ${className}`} data-open={open ? 'true' : 'false'}>
      <div ref={innerRef} className="drawer-grid-inner">
        <div className="drawer-grid-content">{children}</div>
      </div>
    </div>
  );
}
