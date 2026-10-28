// Reads the layout direction that expo-router passes to the native screen header (back arrow, title, header
// buttons). It comes from LocaleProvider in app/_layout.tsx (decision D-14).
import { screen } from 'expo-router/testing-library';

interface TreeNode {
  type: unknown;
  props: Record<string, unknown>;
  children?: unknown[];
}

function isNode(value: unknown): value is TreeNode {
  return typeof value === 'object' && value !== null && 'type' in value && 'props' in value;
}

export function headerDirections(): unknown[] {
  const found: unknown[] = [];
  const walk = (node: unknown) => {
    if (!isNode(node)) return;
    if (node.type === 'RNSScreenStackHeaderConfig') found.push(node.props.direction);
    (node.children ?? []).forEach(walk);
  };
  walk(screen.root);
  return found;
}

/** For every header slot ("left", "right", "center"), the testIDs and image labels inside it, in order. */
export function headerSlotContents(): { slot: unknown; items: string[] }[] {
  const slots: { slot: unknown; items: string[] }[] = [];
  const collect = (node: unknown, items: string[]) => {
    if (!isNode(node)) return;
    if (typeof node.props.testID === 'string') items.push(node.props.testID);
    if (node.props.accessibilityRole === 'image' && typeof node.props.accessibilityLabel === 'string') {
      items.push(`image:${node.props.accessibilityLabel}`);
    }
    (node.children ?? []).forEach((child) => {
      collect(child, items);
    });
  };
  const walk = (node: unknown) => {
    if (!isNode(node)) return;
    if (node.type === 'RNSScreenStackHeaderSubview') {
      const items: string[] = [];
      collect(node, items);
      slots.push({ slot: node.props.type, items });
    } else (node.children ?? []).forEach(walk);
  };
  walk(screen.root);
  return slots;
}
