import { Component, inject, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  Category,
  CategoryNode,
  PostData,
} from '../../../shared/projectObjects/varObjects';
import { BackEnd } from '../shared/services/back-end';

import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzRateModule } from 'ng-zorro-antd/rate';

import {
  NzTableModule,
  NzTableSortFn,
  NzTableFilterList,
  NzTableFilterFn,
  NzTableQueryParams,
} from 'ng-zorro-antd/table';

import {
  NzTreeModule,
  NzFormatEmitEvent,
  NzTreeComponent,
  NzTreeNodeOptions,
} from 'ng-zorro-antd/tree';
import { NzTreeSelectModule } from 'ng-zorro-antd/tree-select';

import { NzIconModule } from 'ng-zorro-antd/icon';

function mapCategoryNodesToTree(nodes: CategoryNode[]): NzTreeNodeOptions[] {
  return nodes.map((n) => ({
    key: String(n.id),
    // title: n.name ?? '(untitled)',
    title:
      // n.name !== null && n.name !== undefined
      //   ? n.name + '-' + String(n.id)
      //   : '(untitled)',
      n.name !== null && n.name !== undefined ? n.name : '(untitled)',
    children: n.subCategoryNode
      ? mapCategoryNodesToTree(n.subCategoryNode)
      : [],
    isLeaf: !n.subCategoryNode || n.subCategoryNode.length === 0,
  }));
}

@Component({
  selector: 'app-db-articles',
  imports: [
    FormsModule,
    NzLayoutModule,
    NzMenuModule,
    NzCheckboxModule,
    NzButtonModule,
    NzTreeModule,
    NzTreeSelectModule,
    NzTableModule,
    NzIconModule,
    NzRateModule,
  ],
  templateUrl: './db-articles.html',
  styleUrl: './db-articles.scss',
})
export class DbArticles {
  public $categories = signal<Category[]>([]);
  public $categoryForest = signal<CategoryNode[]>([]);
  public $treeNodes = signal<NzTreeNodeOptions[]>([]);

  public $articles = signal<PostData[]>([]);
  public $articlesMetaData = signal<PostData[]>([]);

  private backendService = inject(BackEnd);

  public unassignedOnly: boolean = true; // All Unassigned Articles
  public treeDisabled: boolean = true; // when true: the whole tree is disabled

  expandedKeys: string[] = [];
  selectedKeys: string[] = [];

  @ViewChild(NzTreeComponent) nztree!: NzTreeComponent;

  // 250821 - Added for table support.
  // Pagination state (two-way bound)
  pageIndex = 1;
  pageSize = 10;
  public nzRateToolTips: string[] = ['bad', 'ok', 'good', 'great', 'must'];
  private str = (v: any) => (v ?? '').toString().toLowerCase();

  // sortById: NzTableSortFn<PostData> = (a, b) => this.str(a.id).localeCompare(this.str(b.id));
  sortById: NzTableSortFn<PostData> = (a, b) => a.id! - b.id!;
  sortByTitle: NzTableSortFn<PostData> = (a, b) =>
    this.str(a.title).localeCompare(this.str(b.title));
  sortByLink: NzTableSortFn<PostData> = (a, b) =>
    this.str(a.link).localeCompare(this.str(b.link));
  sortByHostname: NzTableSortFn<PostData> = (a, b) =>
    this.str(a.hostname).localeCompare(this.str(b.hostname));
  sortByListname: NzTableSortFn<PostData> = (a, b) =>
    this.str(a.listname).localeCompare(this.str(b.listname));
  sortByDate: NzTableSortFn<PostData> = (a, b) => a.date.localeCompare(b.date);
  sortByLikes: NzTableSortFn<PostData> = (a, b) => a.likes - b.likes;
  sortByRanking: NzTableSortFn<PostData> = (a, b) =>
    (a.ranking ?? 0) - (b.ranking ?? 0);

  constructor() {}

  ngOnInit() {
    this.getCategoryForestByParentId(null);
    // this.getArticlesById();
    this.getUnassignedArticles();
  }

  public isOnlyUnassignedToggle() {
    // this.rootOnly = !this.rootOnly;
    console.log('>===>> Unasigned Articles Only? ', this.unassignedOnly);
    if (this.unassignedOnly) {
      // this.getCategoriesByParentId(null);
      this.clearSelection(); // optional: also clear selection
      this.treeDisabled = true;
      // To-Do:
      // Select all articles with no category assigned
    } else {
      // this.getCategoriesByParentId();
      this.treeDisabled = false;
    }
  }

  private clearSelection() {
    this.selectedKeys = [];
    if (this.nztree) {
      this.nztree.getSelectedNodeList().forEach((n) => (n.isSelected = false));
    }
  }

  onTreeNodeClick(event: NzFormatEmitEvent) {
    const node = event.node;
    if (!node) return;

    console.log('>===>> Node clicked: ', node.key, ' - ', node.title);

    // select the clicked node
    this.selectedKeys = [node.key!];

    // emulate "expand on click": toggle expansion for non-leaf nodes
    if (!node.isLeaf) {
      node.isExpanded = !node.isExpanded;
      // sync expandedKeys from the tree
      this.expandedKeys = this.nztree.getExpandedNodeList().map((n) => n.key!);
    }
  }

  onCheckBoxChanged(event: NzFormatEmitEvent) {
    const node = event.node;
    if (!node) return;
    console.log(
      '>===>> Node Checked change: ',
      node.key,
      ' - ',
      node.title,
      node
    );
  }

  onTreeNodeExpandChange(event: NzFormatEmitEvent) {
    const node = event.node;
    if (!node) return;

    if (node.isExpanded) {
      if (!this.expandedKeys.includes(node.key!)) {
        this.expandedKeys = [...this.expandedKeys, node.key!];
      }
    } else {
      this.expandedKeys = this.expandedKeys.filter((k) => k !== node.key);
    }
  }

  onMarkdown(row: PostData, index: number, e: MouseEvent) {

    e.stopPropagation(); // avoid triggering row click/expand

    // console.log('>===>> Markdown click', { row, index });

    // const data: object = { postDataRow: row, message: 'Hello from DbArticles Window' };
    const article: PostData = this.$articles().find(a => a.id === row.id)!;
    if (window.electronAPI.openWindow) {
      window.electronAPI.openWindow(article);
    }
  }

  // immutable update when user changes the stars
  onRankChange(row: PostData, value: number) {
    // this.posts.update((arr) =>
    //   arr.map((it) =>
    //     it.id === row.id || it.link === row.link
    //       ? { ...it, ranking: value }
    //       : it
    //   )
    // );
  }

  async getCategoriesByParentId(parent_Id?: null | number) {
    try {
      const cats = await this.backendService.getCategoriesByParentId(parent_Id);
      console.log(
        '>===>> ',
        cats.length,
        ' Categories Fetched: ',
        JSON.stringify(cats)
      );
      if (cats.length > 0) this.$categories.set(cats);
    } catch (error) {
      console.log('>===>> Error fetching Categories from BackEnd: ', error);
    }
  }

  async getCategoryForestByParentId(parent_Id?: null | number) {
    try {
      const catForest: CategoryNode[] =
        await this.backendService.getCategoryForestByParentId(parent_Id);
      // console.log(
      //   '>===>> ',
      //   catForest.length,
      //   ' Category Forest Fetched: ',
      //   JSON.stringify(catForest)
      // );
      if (catForest.length > 0) {
        this.$categoryForest.set(catForest);
        this.$treeNodes.set(mapCategoryNodesToTree(this.$categoryForest()));
      }
    } catch (error) {
      console.log(
        '>===>> Error fetching Category Forest from BackEnd: ',
        error
      );
    }
  }

  async getUnassignedArticles() {
    let articles: PostData[] = [];
    try {
      articles = await this.backendService.getUncategorizedArticles();
      if (articles.length > 0) {
        this.$articles.set(articles);
        // this.showArticlesMetaDataArray(articles);
        this.$articlesMetaData.set(this.getArticlesMetaDataArray(articles));
        // this.showArticlesMetaDataArray(articles);
      }
    } catch (error) {
      console.log(
        '>===>> Error fetching Un-Assigned / Un-Categorized Articles from BackEnd: ',
        error
      );
    }
  }

  async getArticlesById(id?: number) {
    let articles: PostData[] = [];
    try {
      articles = await this.backendService.getArticlesById(id);
      if (articles.length > 0) {
        this.showArticlesMetaDataArray(articles);
        // To-Do
        // fill the table with articles meta data array
      }
    } catch (error) {
      console.log('>===>> Error fetching Article(s) from BackEnd: ', error);
    }
  }

  showArticlesMetaDataArray(articles: PostData[]) {
    const articleMetaDataArray: PostData[] =
      this.getArticlesMetaDataArray(articles);
    console.log(
      '>===>> ',
      articles.length,
      ' Articles Fetched: ',
      JSON.stringify(articleMetaDataArray)
    );
  }

  getArticlesMetaDataArray(articles: PostData[]): PostData[] {
    let articlesMetaDataArray: PostData[] = [];
    for (let postData of articles) {
      articlesMetaDataArray.push(this.getArticleMetaData(postData));
    }
    return articlesMetaDataArray;
  }

  getArticleMetaData(postData: PostData): PostData {
    const postMetaData: PostData = {
      id: postData.id, // added on 250821
      listname: postData.listname,
      pubauthorslug: postData.pubauthorslug,
      hostname: postData.hostname,
      timestamp: postData.timestamp,
      pubname: postData.pubname,
      authorname: postData.authorname,
      title: postData.title,
      link: postData.link,
      image: postData.image,
      date: postData.date,
      likes: postData.likes,
      comments: postData.comments,
      ranking: postData.ranking, // added on 250820
    };
    return postMetaData;
    //this.postMetaDataString.set(JSON.stringify(postMetaData, null, 2));
  }

  // If we want to expand all nodes that have children:
  private expandAllWithChildren(nodes: NzTreeNodeOptions[]): string[] {
    const keys: string[] = [];
    const walk = (arr: NzTreeNodeOptions[]) => {
      for (const n of arr) {
        if (n.children && n.children.length) {
          if (n.key) keys.push(n.key);
          walk(n.children as NzTreeNodeOptions[]);
        }
      }
    };
    walk(nodes);
    return keys;
  }
}
