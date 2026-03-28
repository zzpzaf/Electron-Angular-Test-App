import { Component, computed, effect, ElementRef, inject, Input, signal, TemplateRef, ViewChild } from '@angular/core';
import { CategoryNodes } from '../shared/services/category-nodes';
import { BackEnd } from '../shared/services/back-end';
import { NzDrawerRef } from 'ng-zorro-antd/drawer';
import { NzFormatEmitEvent, NzTreeComponent, NzTreeNodeOptions } from 'ng-zorro-antd/tree';
import { NzTreeModule } from 'ng-zorro-antd/tree';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { PostData } from '../../../shared/projectObjects/varObjects';
import { NzContextMenuService, NzDropdownMenuComponent, NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzModalRef, NzModalService } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  selector: 'app-article-categories-selection',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NzTreeModule, 
    NzButtonModule, 
    NzIconModule,
    NzToolTipModule,
    NzDividerModule,
    NzDropDownModule,
    NzButtonModule,
    NzFormModule,
    NzInputModule
     
  ],
  templateUrl: './article-categories-selection.html',
  styleUrl: './article-categories-selection.scss'
})
export class ArticleCategoriesSelection {

  private readonly categoryNodesService = inject(CategoryNodes);
  private readonly drawerRef = inject(NzDrawerRef<string[]>, { optional: true });

  // signals
  $treeNodes = signal<NzTreeNodeOptions[]>([]);
  readonly $expandedKeys = signal<string[]>([]);
  readonly $selectedKeys = signal<string[]>([]); // (optional) highlight behavior

  @Input() initialKeys: number[] = [];  // are passed in from ArticlesTable -> openCategoryDrawerForSingleArticle()
  @Input() row: PostData | null = null; // optional, for context - is passed in from ArticlesTable -> openCategoryDrawerForSingleArticle()
  
  @Input() checkedArticleIds: number[] = []; //  is the nr of checked rows that is passed in from ArticlesTable -> openCategoryDrawerForMultipleArticles() 
  
  // $initialKeyStrings = signal<string[]>(this.initialKeys.map(String));
  $initialKeyStrings = signal<string[]>([]);

  readonly $checkedKeys = signal<string[]>([]);

  @ViewChild(NzTreeComponent) nzTree!: NzTreeComponent;






  private backendService = inject(BackEnd);


  private msg = inject(NzMessageService);
  private contextMenu = inject(NzContextMenuService);
  private modal = inject(NzModalService);
  private modalRef?: NzModalRef; // set in openAddSubcategoryModal()
  /** The node we right-clicked on */
  contextNode: NzTreeNodeOptions | null = null;
  
  /** Add-subcategory form */
  popUpForm = new FormGroup({
    categoryName: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] })
  });

  @ViewChild('addSubcategoryTpl', { static: true }) addSubcategoryTpl!: TemplateRef<unknown>;
  @ViewChild('ctxMenu', { static: true }) ctxMenu!: NzDropdownMenuComponent;
  // @ViewChild('treeEl', { static: true, read: ElementRef }) treeEl!: ElementRef<HTMLElement>; // DOM (optional)





  constructor() {
    // keep tree nodes in sync with your service
    // readonly $treeNodes = computed(() => this.categoryNodesService.$catTreeNodes());
    effect(() => {
      this.$treeNodes.set(this.categoryNodesService.$catTreeNodes());
      if (this.$treeNodes().length > 0) {
        this.$initialKeyStrings.set(this.initialKeys.map(String));
        this.$checkedKeys.set(this.$initialKeyStrings());
        console.log('>===>> ArticleCategoriesSelection - constructor - effect - Initial Keys: ', this.$initialKeyStrings(), ' - Checked Keys: ', this.$checkedKeys())
        this.setExpandedKeys(this.$treeNodes(), this.$initialKeyStrings());
      }
    });
  }






  rememberContext(node: NzTreeNodeOptions) {
    this.contextNode = node;
  }

  openAddSubcategoryModal() {
    if (!this.contextNode) return;
    this.popUpForm.reset({ categoryName: '' });

    this.modalRef = this.modal.create({
      nzTitle: `Add sub-category under “${this.contextNode.title}”`,
      nzContent: this.addSubcategoryTpl,
      nzOkText: 'Add',
      nzOnOk: () => this.popUpFormSubmitAdd(),
      nzCancelText: 'Cancel',
      nzAutofocus: null
    });
  }

  onRightClick(event: MouseEvent, origin: NzTreeNodeOptions) {
    event.preventDefault();                         // suppress the browser menu
    this.contextNode = origin;                      // remember which node was clicked
    this.contextMenu.create(event, this.ctxMenu);   // open Zorro context menu at cursor
    console.log('Right-clicked on node:', origin, ' Context Menu:', this.ctxMenu);
  }



async popUpFormSubmitAdd(): Promise<boolean> {
  if (this.popUpForm.invalid || !this.contextNode) {
    this.popUpForm.markAllAsTouched();
    return false; // keep modal open
  }

  const parent = this.contextNode;
  const name = this.popUpForm.value.categoryName!.trim();
  if (!name) {
    this.msg.warning('Please enter a name.');
    return false;
  }

  try {
    this.modalRef?.updateConfig({ nzOkLoading: true });

    // 1) Save to DB and get the REAL id
    const created = await this.backendService.addNewCategory(
      name,
      Number(parent.key)     // parentId is number; nz-tree keys are strings
    );

    if (!created) {
      // Your API returned null → failed to add (e.g., duplicate name)
      this.msg.error('Could not add sub-category. It may already exist.');
      return false; // keep modal open
    }

    // 2) Update the tree only after DB confirms
    this.categoryNodesService.setCategoryTreeNodesSignal();


    // 3) Update (re-set) the initial keys (and the $initialKeyStrings)
    this.initialKeys = [];
    if (this.row && this.row.id) this.initialKeys = await this.backendService.getCategoryIdsOfAnArticle(this.row.id);
    this.initialKeys.push(created.id); // add the new category id as well
    //const stringKeys: string[] = this.initialKeys.map(String);
    this.$initialKeyStrings.set(this.initialKeys.map(String));
    console.log('>===>> Initial keys after adding sub-category:', this.initialKeys);

    // 4) Re-set checkedKeys and expandedKeys to reflect the new state
    this.$checkedKeys.set(this.$initialKeyStrings());
    console.log('>===>> ArticleCategoriesSelection - submitAdd - Initial Keys: ', this.$initialKeyStrings(), ' - Checked Keys: ', this.$checkedKeys())

    this.setExpandedKeys(this.$treeNodes(), this.$initialKeyStrings());

    // Expand the parent and select the created child
    // const parentKey = String(parent.key);
    // const newKey  = String(created.id);

    // Expand the parent (always return a NEW array so bindings see the change)
    // this.$expandedKeys.update(keys =>
    //   keys.includes(parentKey) ? [...keys] : [...keys, parentKey]
    // );
    console.log('>===>> Expanded keys after adding sub-category:', this.$expandedKeys());

    // 5) Select the newly created child (single-select)
    this.$selectedKeys.set([created.id.toString()]);

    this.msg.success('Sub-category added');
    return true; // close modal
  } catch (e) {
    this.msg.error('Unexpected error while adding sub-category');
    return false; // keep modal open
  } finally {
    this.modalRef?.updateConfig({ nzOkLoading: false });
  }
}


  onTreeEvent(e: NzFormatEmitEvent) {
    // handle selection if needed
  }









  
  // called from host to pre-fill selection (e.g., when opening the drawer)
  // setInitialChecked(keys: string[] = []) {
  //   this.$checkedKeys.set(keys);
  //   this.$expandedKeys.set(this.deriveExpandedFromChecked(keys));
  // }

  // if you want strict checking (no parent-child cascade), set to true
  // checkStrictly = false;

  setExpandedKeys(treeNodes?: NzTreeNodeOptions[], initialKeyStrings?: string[]) {
    const nodes = treeNodes ?? this.$treeNodes();
    const keys = initialKeyStrings ?? this.$initialKeyStrings();
    if (!nodes || !keys) {
      return;
    }

    // Build parent index: key -> parentKey (or null for roots)
    const parentOf = new Map<string, string | null>();
    const stack: Array<{ node: NzTreeNodeOptions; parent: string | null }> = [];

    for (const root of nodes) stack.push({ node: root, parent: null });

    while (stack.length) {
      const { node, parent } = stack.pop()!;
      const key = String(node.key ?? '');
      if (!key) continue;
      parentOf.set(key, parent);
      const children = node.children ?? [];
      for (const c of children) {
        stack.push({ node: c, parent: key });
      }
    }

    // Walk up from each target key to collect all parents
    const expanded = new Set<string>();
    for (const k0 of keys) {
      let k: string | null | undefined = k0;
      // climb: parent, grandparent, ...
      while ((k = parentOf.get(k) ?? null)) {
        expanded.add(k);
      }
    }

    this.$expandedKeys.set([...expanded]);

  }


  onCheck(evt: NzFormatEmitEvent) {
    // evt.keys holds string[] of currently checked node keys
    // this.$checkedKeys.set(evt.keys ?? []);
    // const keys = (evt.checkedKeys ?? []).map(n => n.key!);
    const keys = (evt.checkedKeys ?? []).map((n: any) => String(n.key));
    this.initialKeys = keys.map(Number);
    this.$checkedKeys.set(keys);
    console.log('>===>> ArticleCategoriesSelection - onCheck - Keys: ', keys, ' - Checked Keys: ', this.$checkedKeys());
  }

  onTreeNodeClick(_evt: NzFormatEmitEvent) {
    // optional: sync selectedKeys for highlight
    this.$selectedKeys.set(_evt.keys ?? []);
  }


  onTreeNodeExpandChange(event: NzFormatEmitEvent) {
    const node = event.node;
    if (!node) return;
    if (node.isExpanded) {
      if (!this.$expandedKeys().includes(node.key!)) {
        this.$expandedKeys.set([...this.$expandedKeys(), node.key!]);
      }
    } else {
      this.$expandedKeys.set(this.$expandedKeys().filter((k) => k !== node.key));
    }
  }

  applyAndClose() {
    // When used inside an NzDrawerService component drawer, return the selection
    // this.drawerRef?.close(this.$checkedKeys());
    // convert back to numbers if your backend expects number[]
    const nodes = this.nzTree.getCheckedNodeList(); // NzTreeNode[]
    // const payload = this.$checkedKeys().map(k => Number(k));
    const payload = nodes.map(n => Number(n.key));
    console.log('>===>> Closing drawer with selected category keys:', payload);
    this.drawerRef?.close(payload);
  }

  cancel() {
    this.drawerRef?.close();
  }

  // private deriveExpandedFromChecked(keys: string[]) {
  //   // simple heuristic: expand all parents of checked keys if your data provides them,
  //   // otherwise just expand all for small trees; adjust to your needs.
  //   return []; // keep collapsed by default
  // }
}
