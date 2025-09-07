import { Component, computed, effect, inject, Input, signal, ViewChild } from '@angular/core';
import { CategoryNodes } from '../shared/services/category-nodes';
import { NzDrawerRef } from 'ng-zorro-antd/drawer';
import { NzFormatEmitEvent, NzTreeComponent, NzTreeNodeOptions } from 'ng-zorro-antd/tree';
import { NzTreeModule } from 'ng-zorro-antd/tree';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { PostData } from '../../../shared/projectObjects/varObjects';


@Component({
  selector: 'app-article-categories-selection',
  imports: [
    NzTreeModule, 
    NzButtonModule, 
    NzIconModule,
    NzToolTipModule,
    NzDividerModule,
  ],
  templateUrl: './article-categories-selection.html',
  styleUrl: './article-categories-selection.scss'
})
export class ArticleCategoriesSelection {

  private readonly categoryNodesService = inject(CategoryNodes);
  private readonly drawerRef = inject(NzDrawerRef<string[]>, { optional: true });

  // signals
  readonly $treeNodes = signal<NzTreeNodeOptions[]>([]);
  readonly $expandedKeys = signal<string[]>([]);
  readonly $selectedKeys = signal<string[]>([]); // (optional) highlight behavior

  @Input() initialKeys: number[] = [];
  @Input() row: PostData | null = null; // optional, for context
  readonly $initialKeyStrings = computed(() => (this.initialKeys ?? []).map(String));
  readonly $checkedKeys = signal<string[]>([]);

  @ViewChild(NzTreeComponent) nzTree!: NzTreeComponent;

  constructor() {
    // keep tree nodes in sync with your service
    // readonly $treeNodes = computed(() => this.categoryNodesService.$catTreeNodes());
    effect(() => {
      this.$treeNodes.set(this.categoryNodesService.$catTreeNodes());
      if (this.$treeNodes().length > 0) {
        this.$checkedKeys.set(this.$initialKeyStrings());
        this.setExpandedKeys(this.$treeNodes(), this.$initialKeyStrings());
      }
    });
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
    this.$checkedKeys.set(keys);
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
