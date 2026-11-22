# Spec Delta

## ADDED Requirements

### Requirement: Assignee selection holds each employee at most once
The create form's assignee combobox SHALL treat one employee as one selection
regardless of how the option was constructed: selecting an already-selected
employee SHALL remove that employee from the selection instead of adding a
second one, and the selection SHALL hold each employee id at most once so the
rendered chips and the submitted assignee ids stay distinct.

#### Scenario: Re-selecting an assigned employee toggles them off
- **WHEN** a creator picks an employee from the dropdown who already holds a chip in the assignee combobox
- **THEN** that employee's chip is removed and no additional chip is added

#### Scenario: The preselected creator toggles off instead of duplicating
- **WHEN** the creator is preselected as the default assignee and then selects their own entry from the dropdown list
- **THEN** that employee is removed from the selection instead of duplicated, and no duplicate-key condition arises

#### Scenario: The submitted assignee ids are distinct
- **WHEN** a creator submits the create form with an employee selected through more than one path
- **THEN** the create request carries that employee's id exactly once
