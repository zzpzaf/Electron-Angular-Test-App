# Categories Component – Detailed Description

## Purpose
The `Categories` component provides a rich UI for viewing, managing, and editing hierarchical categories. It supports CRUD operations, parent-child relationships, and integrates with backend and dialog services for data persistence and user feedback.

## Main Features
- **Hierarchical Table View**: Displays categories in a table, with indentation for hierarchy.
- **Selection & Filtering**: Allows selection of categories and toggling between root-only and all categories.
- **CRUD Operations**: Add, edit, and delete categories using modal dialogs and forms.
- **Parent Selection**: Uses a tree-select for parent category assignment, showing ancestor paths.
- **Reactive Signals**: Uses Angular signals for state management and reactivity.

## Key Files
- Component: `categories.ts`, `categories.html`, `categories.scss`
- Services: `back-end.ts`, `dlg-service.ts`, `category-nodes.ts`

## Component Structure & Logic
### State & Signals
- `$categories`: Signal holding the current category list (synced from backend).
- `$levelById`, `$flat`, `$rowsForTable`: Computed signals for hierarchy, table rows, and indentation.
- `selected`, `rootOnly`, `modalVisible`, `isEditMode`, `saving`: UI state signals.
- `formCategory`: Reactive form for category data.
- `$formSnapshot`: Signal for monitoring form changes.
- `$categoryNodes`: Signal for tree-select nodes.
- `fullAncestorsPath`: String showing the ancestor path for the selected parent.

### Services Used
#### 1. **BackEnd Service**
Handles all data operations and IPC communication with the Electron backend/database.
- `setAllCategoriesSignal()`, `setRootCategoriesSignal()`: Fetches categories and updates signals.
- `addNewCategory(name, parentId, description)`: Adds a new category.
- `updateCategoryById(id, name, parentId, description)`: Updates an existing category.
- `deleteCategoryById(id)`: Deletes a category.
- `getCategoriesByParentId(parent_id)`: Fetches categories by parent.
- Signals: `$categories`, `$selectedCategory`, `$categoriesFilter`.

#### 2. **DlgService**
Handles modal dialogs for confirmation, success, error, and info messages using NG-ZORRO modals.
- `popup(dialogData)`: Opens a modal dialog and returns an observable for user response.
- Used for confirming deletions, showing success/error after CRUD operations.

#### 3. **CategoryNodes Service**
Manages category hierarchy and tree-select nodes.
- `buildLevelById(cats)`: Returns a map of category IDs to their hierarchy level.
- `flattenByHierarchy(cats, cmp)`: Flattens categories for table display.
- `setCategoryTreeNodesSignal(parent_Id)`: Updates tree-select nodes.
- `getFullAncestorsPath(nodes, key)`: Returns a string path of ancestors for a given node.

### UI & Template
- **Header Row**: Shows category count and a toggle for root-only view.
- **Table Area**: Displays categories with ID, name (indented by hierarchy), description, and parent info.
- **Actions Row**: Add, edit, and delete buttons (edit/delete disabled if no selection).
- **Modal Dialog**: Form for adding/editing categories, with tree-select for parent assignment and ancestor path display.

### Methods & Event Handlers
- `toggleRootOnly(checked)`: Toggles root-only filter and updates categories.
- `onRowClick(cat)`: Selects a category and triggers selection handler.
- `onAddNew()`: Opens modal for adding a new category (pre-fills parent if selected).
- `onEdit()`: Opens modal for editing the selected category.
- `onDelete()`: Confirms and deletes the selected category via backend and dlgService.
- `submitForm()`: Validates and submits the form for add/edit, calls backend, shows dialog feedback.
- `updateCategoriesSignal()`: Refreshes category list based on rootOnly state.
- `updateFullAncestorsPath(parent_id)`: Updates the ancestor path string for the selected parent.

## Data Flow & Interactions
1. **Initialization**: On load, fetches categories from backend and sets up signals.
2. **User Actions**: Selection, add/edit/delete, and parent assignment update signals and trigger backend calls.
3. **Dialogs**: All destructive or important actions (delete, save) use dlgService for confirmation and feedback.
4. **Hierarchy Management**: CategoryNodes service provides hierarchy flattening, level mapping, and ancestor path calculation for UI display.

## Integration Points
- **BackEnd Service**: All category data is fetched, updated, and persisted via this service, which communicates with the Electron/SQLite backend.
- **DlgService**: All user confirmations and feedback are handled via NG-ZORRO modals.
- **CategoryNodes Service**: Provides hierarchical data and tree-select nodes for parent assignment.

## Summary
The `Categories` component is a feature-rich, reactive Angular component for managing hierarchical categories. It tightly integrates with backend and dialog services for robust data management and user experience, supporting all standard CRUD operations, hierarchy visualization, and parent assignment with ancestor path display.
