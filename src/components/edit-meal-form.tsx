import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { PANDAN } from '@/constants/brand';
import {
  formatMacro,
  hasNamedIngredients,
  namedIngredientCalories,
  parseNonNegative,
  ratioFromMacros,
  reconcileMacrosToCalories,
  scaleMacros,
  type MealMacros,
} from '@/lib/meal-macros';
import type { MealIngredient } from '../../types/supabase';

export type EditableMealValues = {
  dish_name: string;
  total_calories: number;
  macros: {
    protein: number;
    carbs: number;
    fat: number;
  };
  ingredients: MealIngredient[];
};

type IngredientDraft = {
  id: string;
  name: string;
  calories: string;
};

export function EditMealForm({
  initialName,
  initialCalories,
  initialProtein,
  initialCarbs,
  initialFat,
  initialIngredients,
  isSaving,
  onCancel,
  onSave,
}: {
  initialName: string;
  initialCalories: number;
  initialProtein: number;
  initialCarbs: number;
  initialFat: number;
  initialIngredients: MealIngredient[];
  isSaving: boolean;
  onCancel: () => void;
  onSave: (values: EditableMealValues) => void;
}) {
  const { t } = useTranslation();
  const [dishName, setDishName] = useState(initialName);
  const [calories, setCalories] = useState(String(initialCalories));
  const [protein, setProtein] = useState(String(initialProtein));
  const [carbs, setCarbs] = useState(String(initialCarbs));
  const [fat, setFat] = useState(String(initialFat));
  const [macroRatio, setMacroRatio] = useState(() =>
    ratioFromMacros(
      { protein: initialProtein, carbs: initialCarbs, fat: initialFat },
      initialCalories
    )
  );
  const [nextRowId, setNextRowId] = useState(initialIngredients.length + 1);
  const [ingredientRows, setIngredientRows] = useState<IngredientDraft[]>(() =>
    initialIngredients.map((ingredient, index) => ({
      id: `row-${index}`,
      name: ingredient.name,
      calories: String(ingredient.calories),
    }))
  );
  const ratioRef = useRef(macroRatio);
  ratioRef.current = macroRatio;
  const lastLinkedCaloriesRef = useRef<number | null>(null);

  const hasValidIngredients = hasNamedIngredients(ingredientRows);
  const linkedCalories = namedIngredientCalories(ingredientRows);
  const displayedCalories = hasValidIngredients ? String(linkedCalories) : calories;

  useEffect(() => {
    if (!hasValidIngredients) {
      lastLinkedCaloriesRef.current = null;
      return;
    }

    setCalories(String(linkedCalories));
    if (lastLinkedCaloriesRef.current === linkedCalories) {
      return;
    }
    lastLinkedCaloriesRef.current = linkedCalories;
    const scaled = scaleMacros(ratioRef.current, linkedCalories);
    setProtein(formatMacro(scaled.protein));
    setCarbs(formatMacro(scaled.carbs));
    setFat(formatMacro(scaled.fat));
  }, [hasValidIngredients, linkedCalories]);

  const rememberMacroRatio = (next: MealMacros) => {
    const total = hasValidIngredients ? linkedCalories : parseNonNegative(calories);
    setMacroRatio(ratioFromMacros(next, total));
  };

  const macroFields = useMemo(
    () =>
      [
        {
          key: 'calories',
          label: t('calories'),
          value: displayedCalories,
          onChange: hasValidIngredients ? undefined : setCalories,
          unit: t('kcal'),
          editable: !hasValidIngredients,
        },
        {
          key: 'protein',
          label: t('protein'),
          value: protein,
          onChange: (value: string) => {
            setProtein(value);
            rememberMacroRatio({
              protein: parseNonNegative(value),
              carbs: parseNonNegative(carbs),
              fat: parseNonNegative(fat),
            });
          },
          unit: 'g',
          editable: true,
        },
        {
          key: 'carbs',
          label: t('carbs'),
          value: carbs,
          onChange: (value: string) => {
            setCarbs(value);
            rememberMacroRatio({
              protein: parseNonNegative(protein),
              carbs: parseNonNegative(value),
              fat: parseNonNegative(fat),
            });
          },
          unit: 'g',
          editable: true,
        },
        {
          key: 'fat',
          label: t('fats'),
          value: fat,
          onChange: (value: string) => {
            setFat(value);
            rememberMacroRatio({
              protein: parseNonNegative(protein),
              carbs: parseNonNegative(carbs),
              fat: parseNonNegative(value),
            });
          },
          unit: 'g',
          editable: true,
        },
      ] as const,
    [carbs, displayedCalories, fat, hasValidIngredients, protein, t]
  );

  const updateIngredient = (id: string, patch: Partial<IngredientDraft>) => {
    setIngredientRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  };

  const handleSave = () => {
    const name = dishName.trim();
    if (!name) {
      Alert.alert(t('edit'), t('saveFailed'));
      return;
    }

    const ingredients = ingredientRows.flatMap((row) => {
      const ingredientName = row.name.trim();
      if (!ingredientName) {
        return [];
      }
      return [
        {
          name: ingredientName,
          calories: Math.round(parseNonNegative(row.calories)),
        },
      ];
    });
    const totalCalories = hasValidIngredients
      ? linkedCalories
      : Math.round(parseNonNegative(calories));
    const typedMacros = {
      protein: parseNonNegative(protein),
      carbs: parseNonNegative(carbs),
      fat: parseNonNegative(fat),
    };

    onSave({
      dish_name: name,
      total_calories: totalCalories,
      macros: hasValidIngredients
        ? reconcileMacrosToCalories(typedMacros, totalCalories)
        : typedMacros,
      ingredients,
    });
  };

  return (
    <View>
      <BottomSheetTextInput
        value={dishName}
        onChangeText={setDishName}
        placeholderTextColor="#C4BEB5"
        style={styles.nameInput}
      />

      <View style={styles.fieldList}>
        {macroFields.map((field, index) => (
          <View
            key={field.key}
            style={[styles.fieldRow, index === macroFields.length - 1 && styles.fieldRowLast]}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <BottomSheetTextInput
              value={field.value}
              onChangeText={field.onChange}
              editable={field.editable}
              keyboardType="decimal-pad"
              style={[styles.fieldInput, !field.editable && styles.fieldInputReadonly]}
            />
            <Text style={styles.fieldUnit}>{field.unit}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.ingredientsHeading}>{t('ingredients')}</Text>
      {ingredientRows.length > 0 ? (
      <View style={styles.fieldList}>
        {ingredientRows.map((row, index) => (
          <View
            key={row.id}
            style={[
              styles.ingredientRow,
              index === ingredientRows.length - 1 && styles.fieldRowLast,
            ]}>
            <BottomSheetTextInput
              value={row.name}
              onChangeText={(name) => updateIngredient(row.id, { name })}
              style={styles.ingredientNameInput}
            />
            <BottomSheetTextInput
              value={row.calories}
              onChangeText={(next) => updateIngredient(row.id, { calories: next })}
              keyboardType="number-pad"
              style={styles.ingredientCalorieInput}
            />
            <Text style={styles.ingredientUnit}>cal</Text>
            <Pressable
              onPress={() =>
                setIngredientRows((current) => current.filter((item) => item.id !== row.id))
              }
              hitSlop={8}
              style={({ pressed }) => pressed && styles.pressed}>
              <Text style={styles.removeMark}>×</Text>
            </Pressable>
          </View>
        ))}
      </View>
      ) : null}

      <Pressable
        onPress={() => {
          setIngredientRows((current) => [
            ...current,
            {
              id: `row-${nextRowId}`,
              name: '',
              calories:
                current.length === 0
                  ? String(Math.round(parseNonNegative(displayedCalories)))
                  : '0',
            },
          ]);
          setNextRowId((current) => current + 1);
        }}
        style={({ pressed }) => [styles.addIngredient, pressed && styles.pressed]}>
        <Text style={styles.addIngredientText}>{t('addIngredient')}</Text>
      </Pressable>

      <Pressable
        onPress={handleSave}
        disabled={isSaving}
        style={({ pressed }) => [
          styles.primaryButton,
          isSaving && styles.buttonDisabled,
          pressed && !isSaving && styles.pressed,
        ]}>
        <Text style={styles.primaryButtonText}>{t('save')}</Text>
      </Pressable>
      <Pressable
        onPress={onCancel}
        disabled={isSaving}
        style={({ pressed }) => [
          styles.secondaryButton,
          isSaving && styles.buttonDisabled,
          pressed && !isSaving && styles.pressed,
        ]}>
        <Text style={styles.secondaryButtonText}>{t('cancel')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  nameInput: {
    color: '#2C2A26',
    fontSize: 26,
    fontWeight: '600',
    lineHeight: 32,
    backgroundColor: '#F6F1EA',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  fieldList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 24,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#EDE6DC',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1ECE4',
  },
  fieldRowLast: {
    borderBottomWidth: 0,
  },
  fieldLabel: {
    flex: 1,
    color: '#2C2A26',
    fontSize: 15,
  },
  fieldInput: {
    minWidth: 72,
    maxWidth: 120,
    textAlign: 'right',
    color: '#8A847A',
    fontSize: 16,
    backgroundColor: '#F6F1EA',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  fieldInputReadonly: {
    color: '#C4BEB5',
  },
  fieldUnit: {
    color: '#8A847A',
    fontSize: 14,
    minWidth: 32,
  },
  ingredientsHeading: {
    color: '#2C2A26',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1ECE4',
  },
  ingredientNameInput: {
    flex: 1,
    color: '#2C2A26',
    fontSize: 15,
    backgroundColor: '#F6F1EA',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  ingredientCalorieInput: {
    minWidth: 56,
    maxWidth: 72,
    textAlign: 'right',
    color: '#8A847A',
    fontSize: 14,
    backgroundColor: '#F6F1EA',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  ingredientUnit: {
    color: '#8A847A',
    fontSize: 14,
  },
  removeMark: {
    color: '#9A958C',
    fontSize: 22,
    lineHeight: 22,
    paddingHorizontal: 2,
  },
  addIngredient: {
    alignItems: 'center',
    marginBottom: 24,
  },
  addIngredientText: {
    color: PANDAN,
    fontSize: 15,
    fontWeight: '600',
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: PANDAN,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: '#F3EEE6',
    marginTop: 10,
  },
  secondaryButtonText: {
    color: '#2C2A26',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.82,
  },
});
