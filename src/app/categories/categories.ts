import {
  Component,
  computed,
  effect,
  inject,
  signal,
  NgModule,
  Signal,
} from '@angular/core';
import {
  FormsModule,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { CommonModule } from '@angular/common';

import { Category } from '../../../shared/projectObjects/varObjects';
import { BackEnd } from '../shared/services/back-end';

import { NzTableComponent } from 'ng-zorro-antd/table';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzFormModule } from 'ng-zorro-antd/form';
import { CategoryNodes } from '../shared/services/category-nodes';
import { NzTreeSelectModule } from 'ng-zorro-antd/tree-select';
import { NzTreeNode, NzTreeNodeOptions } from 'ng-zorro-antd/tree';

import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import { DlgService } from '../shared/services/dlg-service';

// /** Parent → children DFS flatten (siblings sorted by id) */
// function flattenByHierarchy(
//   cats: Category[],
//   cmp: (a: Category, b: Category) => number = (a, b) => a.name.localeCompare(b.name)
// ): Category[] {
//   const items = [...cats];
//   const byParent = new Map<number | null, Category[]>();

//   for (const c of items) {
//     const k = c.parent_id ?? null;
//     (byParent.get(k) ?? byParent.set(k, []).get(k)!).push(c);
//   }
//   // sort every sibling group
//   for (const arr of byParent.values()) arr.sort(cmp);

//   const out: Category[] = [];
//   const visit = (pid: number | null) => {
//     for (const c of byParent.get(pid) ?? []) {
//       out.push(c);         // parent
//       visit(c.id);         // then all its descendants
//     }
//   };

//   // roots are parent_id === null OR orphaned (parent missing)
//   const ids = new Set(items.map(c => c.id));
//   const roots = (byParent.get(null) ?? []).slice();
//   for (const c of items) if (c.parent_id != null && !ids.has(c.parent_id)) roots.push(c);
//   roots.sort(cmp);

//   // emit roots (each will emit its subtree)
//   for (const r of roots) {
//     out.push(r);
//     visit(r.id);
//   }

//   return out;
// }

// /** Map<id, level> for indentation */
// function buildLevelById(cats: Category[]): Map<number, number> {
//   const byId = new Map(cats.map(c => [c.id, c]));
//   const cache = new Map<number, number>();
//   const levelOf = (id: number): number => {
//     if (cache.has(id)) return cache.get(id)!;
//     const c = byId.get(id)!;
//     const lvl = c.parent_id == null || !byId.has(c.parent_id) ? 0 : levelOf(c.parent_id) + 1;
//     cache.set(id, lvl);
//     return lvl;
//   };
//   byId.forEach((_c, id) => levelOf(id));
//   return cache;
// }

  type CategoryPayload = { name: string; description: string; parent_id: number | null };



@Component({
  selector: 'app-categories',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NzTableComponent,
    NzSelectModule,
    NzButtonModule,
    NzCheckboxModule,
    NzInputModule,
    NzModalModule,
    NzFormModule,
    NzTreeSelectModule,
  ],
  templateUrl: './categories.html',
  styleUrl: './categories.scss',
})
export class Categories {
  // Swap this injector token with your real BackendService
  private backendService = inject(BackEnd);
  private categoryNodesService = inject(CategoryNodes);
  private dlgService = inject(DlgService);
  private fb = inject(FormBuilder);

  /** Local categories signal populated from backendService.$categories via an effect */
  $categories = signal<Category[]>([]);

  readonly $levelById = computed(() =>
    this.categoryNodesService.buildLevelById(this.$categories())
  );
  readonly $flat = computed(
    () =>
      this.categoryNodesService.flattenByHierarchy(this.$categories(), (a, b) =>
        a.name.localeCompare(b.name)
      )
    // use (a, b) => a.id - b.id if you want id order
  );
  readonly $rowsForTable = computed(() =>
    this.rootOnly()
      ? this.$flat().filter((c) => c.parent_id === null)
      : this.$flat()
  );

  /** UI state */
  readonly selected = signal<Category | null>(null);
  readonly rootOnly = signal<boolean>(false);

  readonly modalVisible = signal<boolean>(false);
  readonly isEditMode = signal<boolean>(false);
  readonly saving = signal<boolean>(false);

  /** Reactive form */
  formCategory: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    parent_id: [null as string | null],
  });


  // This signal is used for monitoring form changes
  readonly $formSnapshot = toSignal<CategoryPayload>(
    this.formCategory.valueChanges.pipe(
      startWith(this.formCategory.getRawValue() as CategoryPayload)
    ),
    { requireSync: true }  // <- returns Signal<CategoryPayload> (no undefined)
  );
  


  public $categoryNodes = signal<NzTreeNodeOptions[]>([]);

  fullAncestorsPath: string = '';

  constructor() {
    // Effect to keep local categories in sync with service signal
    console.log('>===>> Categories component initialized');
    if (this.$categories().length === 0) {
      this.backendService.setAllCategoriesSignal();
    }
    effect(() => {
      const cats = this.backendService.$categories?.() ?? [];
      this.$categories.set(cats);
      console.log(
        '>===>> Categories effect - categories updated, count=',
        this.$categories().length
      );
      this.$categoryNodes.set(this.categoryNodesService.$catTreeNodes());

      // Capture form changes using the $formSnapshot signal
      if (!this.modalVisible()) return;          // gate by visibility
      // const current = this.$formSnapshot();       // <- latest form value (any control)
      // console.log('>===>> Categories effect - formSnapshot:', current);
      this.updateFullAncestorsPath();

    });
  }


  parentName = (parentId: number | null) => {
    if (parentId === null) return '—';
    const p = this.$categories().find((c) => c.id === parentId);
    return p ? `${p.id} - ${p.name}` : 'Unknown';
  };

  parentOptions = computed(() => {
    const list = this.$categories();
    const sel = this.selected();
    return sel ? list.filter((c) => c.id !== sel.id) : list;
    // Note: keep self out of parent options when editing to avoid cycles
  });

  toggleRootOnly(checked: boolean) {
    console.log('>===>> toggleRootOnly? ', checked);
    this.rootOnly.set(!!checked);
    // this._rootOnlyTmp = this.rootOnly();
    console.log('>===>> toggleRootOnly - this.rootOnly? ', this.rootOnly());
    this.updateCategoriesSignal();
  }

  /** Row selection */
  onRowClick(cat: Category) {
    this.selected.set(cat);
    this.handleCategorySelect(cat);
  }

  /** External selection handler stub */
  handleCategorySelect(cat: Category) {
    // TODO: emit an output or call into a parent handler as needed.
    console.debug('[Categories] selected:', cat);
  }

  /** Buttons */
  onAddNew() {
    const sel = this.selected();
    if (!sel) return;
    console.log('>===>> Adding new category');
    
    this.formCategory.patchValue(
      {
        name: '',
        description: '',
        parent_id: sel.id ? String(sel.id) : null,
      }
    );

    this.isEditMode.set(false);
    // this.formCategory.reset({ name: '', description: '', parent_id: null });
    this.modalVisible.set(true);
  }

  onEdit() {
    const sel = this.selected();
    if (!sel) return;
    this.isEditMode.set(true);
    console.log('>===>> Editing category:', sel);

    // populate the form (works even if the modal content is not yet in the DOM)
    this.formCategory.patchValue(
      {
        name: sel.name ?? '',
        description: sel.description ?? '',
        parent_id: sel.parent_id ? String(sel.parent_id) : null,
      }
    );
    // this.updateFullAncestorsPath(sel.parent_id);
    console.log('>===>> onEdit() - Form after patch:', this.formCategory.getRawValue());
    this.modalVisible.set(true);
  }

  async onDelete() {
    const sel = this.selected();
    if (!sel) return;
    this.dlgService.popup({
      token: 'conf',
      header: 'Confirm Deletion',
      content: 'Are you sure you want to delete the "' + sel.name + '" category?',
      posAnsMsg: 'Yes',
      negAnsMsg: 'No',
    })
    .subscribe(async (confirmed) => {
      if (confirmed) {
        try {
          this.saving.set(true);
          const result = await this.backendService.deleteCategoryById(sel.id);
          if (result) {
            this.dlgService.popup({
              token: 'succ',
              header: 'Category Deleted!',
              content: 'Category with ID ' + sel.id + ' was deleted successfully.',
              posAnsMsg: 'OK',
              negAnsMsg: '',
            });
            this.updateCategoriesSignal();
          } else {
            this.dlgService.popup({
              token: 'error',
              header: 'Error deleting Category!',
              content: 'Failed to delete category with ID ' + sel.id + '.',
              posAnsMsg: 'OK',
              negAnsMsg: '',
            });
          }
          this.selected.set(null);
        } finally {
          this.saving.set(false);
        }
      } 
    });
  }

  closeModal() {
    this.modalVisible.set(false);
  }

  onTreeNodeSelectChange(selectedNode: any) {
    // Try logging the event to see what it contains
    console.log('Event:', selectedNode);
    // If it's an array (for multi-select), handle accordingly:
    if (Array.isArray(selectedNode)) {
      selectedNode.forEach((node) => {
        console.log(node.key, node.title);
      });
    } else if (selectedNode && selectedNode.key) {
      console.log(selectedNode.key, selectedNode.title);
    }
  }

  async submitForm() {
    if (this.formCategory.invalid) {
      this.formCategory.markAllAsTouched();
      return;
    }
    const payload = this.formCategory.value as Omit<Category, 'id'>;

    const parentId: number | null = this.formCategory.value.parent_id
      ? Number(this.formCategory.value.parent_id)
      : null;
    if (parentId !== null) {
      payload.parent_id = parentId;
    }

    console.log('>===>> Submitting form, payload:', payload);

    try {
      this.saving.set(true);
      if (this.isEditMode()) {
        const sel = this.selected();
        if (!sel) return;
        const updated: boolean = await this.backendService.updateCategoryById(
          // *** UPDATING EXISTING CATEGORY ***
          sel.id,
          payload.name,
          payload.parent_id,
          payload.description
        );
        if (updated) {
          this.dlgService
          .popup({
            token: 'succ',
            header: 'Category Updated!',
            content: 'Category with ID ' + sel.id + ' was updated successfully.',
            posAnsMsg: 'OK',
            negAnsMsg: '',
          })
          .subscribe((res) => console.log('Dialog closed with:', res));
          this.updateCategoriesSignal();
        } else {
          this.dlgService
          .popup({
            token: 'error',
            header: 'Error updating Category!',
            content: 'Failed to update category with ID ' + sel.id + '.',
            posAnsMsg: 'OK',
            negAnsMsg: '',
          })
          .subscribe((res) => console.log('Dialog closed with:', res));
        }      
      } else {
        const result = await this.backendService.addNewCategory(
          // *** CREATING NEW CATEGORY ***
          payload.name,
          payload.parent_id,
          payload.description
        );
        console.log(
          '>===>> New category created? ',
          result ? result : 'Failed!'
        );
        if (result) {
          this.selected.set(result);
          this.dlgService
            .popup({
              token: 'succ',
              header: 'New Category Created!',
              content: 'Category with ID ' + result.id + ' was created successfully.',
              posAnsMsg: 'OK',
              negAnsMsg: '',
            })
            .subscribe((res) => console.log('Dialog closed with:', res));
          this.updateCategoriesSignal();
        } else {
          this.dlgService
            .popup({
              token: 'error',
              header: 'Error creating a new Category!',
              content: 'Failed to create category.',
              posAnsMsg: 'OK',
              negAnsMsg: '',
            })
            .subscribe((res) => console.log('Dialog closed with:', res));
        }
      }
      this.modalVisible.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  private updateCategoriesSignal() {
    if (this.rootOnly()) {
      this.backendService.setRootCategoriesSignal();
    } else {
      this.backendService.setAllCategoriesSignal();
    }
  }


  updateFullAncestorsPath(parent_id?: number | null) {
    console.log('>===>> updateFullAncestorsPath - parent_id:', parent_id);
    if (parent_id === undefined) {
      parent_id = this.$formSnapshot().parent_id !== null ? Number(this.$formSnapshot().parent_id) : null;
    }
    this.fullAncestorsPath = this.categoryNodesService.getFullAncestorsPath(
      this.$categoryNodes(),
      parent_id !== null ? String(parent_id) : ''
    ) ?? '';
    const addOn: string = this.fullAncestorsPath ? ' (' + (parent_id !== null ? String(parent_id) : '') + ')' : ' (no ancestors)'; 
    this.fullAncestorsPath = this.fullAncestorsPath + addOn;
  }
}
