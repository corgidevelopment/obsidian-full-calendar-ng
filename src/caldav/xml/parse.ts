export type Updater<T> = (target: T, value: any) => T;
export type Appliance<F> = Record<string, (props: Record<string, any>, target: F) => F>;

function applier<T>(property: string, props: Record<string, any>, target: T, updater: Updater<T>) {
  return updater(target, props[property]);
}

function makeApplier<T>(property: string, updater: Updater<T>) {
  return (props: Record<string, any>, target: T) => applier(property, props, target, updater);
}

export function makeAppliance<T>(map: Record<string, Updater<T>>): Appliance<T> {
  return Object.fromEntries(Object.entries(map).map((entry) => [entry[0], makeApplier(entry[0], entry[1])]));
}

export function parseProps<T>(props: any, target: T, appliance: Appliance<T>): T {
  let _target = target;
  for (let entry of Object.entries(props)) {
    let x = entry[0];
    let applier = appliance[x];
    if (applier) {
      _target = applier(props, _target);
    }
  }
  return _target;
}
