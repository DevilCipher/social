export const palettes = { rose: 'Dusty rose', indigo: 'Indigo', forest: 'Forest' };
export const defaultAppearance = {
  name: 'Heart Social',
  workspace: 'untenanted_heart',
  heading: 'Your words, everywhere.',
  introduction: 'A little less switching tabs. A little more creating.',
  palette: 'rose',
};
export const appearanceFields = {
  name: ['Studio name', 60],
  workspace: ['Workspace label', 70],
  heading: ['Dashboard heading', 90],
  introduction: ['Dashboard introduction', 220],
};

export function validateAppearance(input) {
  const appearance = {};
  for (const [key, [label, maximum]] of Object.entries(appearanceFields)) {
    const value = typeof input?.[key] === 'string' ? input[key].trim() : '';
    if (!value || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
      throw new Error(label + ' must contain 1–' + maximum + ' characters.');
    }
    appearance[key] = value;
  }
  if (!Object.hasOwn(palettes, input.palette)) throw new Error('Choose a color palette.');
  appearance.palette = input.palette;
  return appearance;
}
