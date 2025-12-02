import { describe, expect, test } from '@jest/globals';
import {
  isImageProperties,
  isInputProperties,
  isLabelProperties,
  isTableProperties,
} from './components';

describe('Components', () => {
  test('isImageProperties validates valid ImageProperties', () => {
    const properties = {
      name: 'hero',
      type: 'image',
      image: {
        name: 'hero.png',
        data: new Blob(['image data goes here']),
        placeholder: 'Banner image. The text reads, "Welcome to the next level!"',
      },
    };
    expect(isImageProperties(properties)).toBeTruthy();
  });

  test('isImageProperties invalidates non-ImageProperties', () => {
    const properties = {
      name: 'hero',
      type: 'label',
      label: {
        text: 'This is not an image. This is a label.',
      },
    };
    expect(isImageProperties(properties)).toBeFalsy();
  });

  test('isInputProperties validates valid InputProperties', () => {
    const properties = {
      name: 'text-entry',
      type: 'input',
      input: {
        type: 'text',
        placeholder: 'Juan dela Cruz',
      },
    };
    expect(isInputProperties(properties)).toBeTruthy();
  });

  test('isInputProperties invalidates non-InputProperties', () => {
    const properties = {
      name: 'hero',
      type: 'image',
      image: {
        name: 'hero.png',
        data: new Blob(['image data goes here']),
        placeholder: 'Banner image. The text reads, "Welcome to the next level!"',
      },
    };
    expect(isInputProperties(properties)).toBeFalsy();
  });

  test('isLabelProperties validates valid LabelProperties', () => {
    const properties = {
      name: 'title-heading',
      type: 'label',
      label: {
        text: 'Z-A Royale Participant Registration Form',
        fontWeight: 'bold',
        fontSize: 16,
      },
    };
    expect(isLabelProperties(properties)).toBeTruthy();
  });

  test('isLabelProperties invalidates non-LabelProperties', () => {
    const properties = {
      name: 'text-entry',
      type: 'input',
      input: {
        type: 'text',
        placeholder: 'Juan dela Cruz',
      },
    };
    expect(isLabelProperties(properties)).toBeFalsy();
  });

  test('isTableProperties validates valid TableProperties', () => {
    const properties = {
      name: 'sample-table',
      type: 'table',
      table: {
        minRows: 1,
        maxRows: 3,
        columns: [
          {
            name: 'participant-name',
            type: 'input',
            input: {
              type: 'text',
              placeholder: 'Taunie',
            },
          },
          {
            name: 'participant-birth-date',
            type: 'input',
            input: {
              type: 'date',
              placeholder: 'YYYY-MM-DD',
            },
          },
          {
            name: 'participant-pokemon-count',
            type: 'input',
            input: {
              type: 'number',
              min: 1,
              max: 6,
              placeholder: 6,
            },
          },
        ],
      },
    };
    expect(isTableProperties(properties)).toBeTruthy();
  });

  test('isTableProperties invalidates non-TableProperties', () => {
    const properties = {
      name: 'title-heading',
      type: 'label',
      label: {
        text: 'Z-A Royale Participant Registration Form',
        fontWeight: 'bold',
        fontSize: 16,
      },
    };
    expect(isTableProperties(properties)).toBeFalsy();
  });
});
