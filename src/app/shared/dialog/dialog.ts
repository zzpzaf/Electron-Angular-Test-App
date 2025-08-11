import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzModalRef, NzModalModule, NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzIconService } from 'ng-zorro-antd/icon';
// import { NzModalService } from 'ng-zorro-antd/modal';

// import {
//   InfoCircleOutline,
//   QuestionCircleOutline,
//   CheckCircleOutline,
//   CloseCircleOutline,
//   ExclamationCircleOutline
// } from '@ant-design/icons-angular/icons';
import {
  InfoCircleTwoTone,
  QuestionCircleTwoTone,
  CheckCircleTwoTone,
  CloseCircleTwoTone,
  ExclamationCircleTwoTone,
} from '@ant-design/icons-angular/icons';
// import { Observable } from 'rxjs';

export type MsgToken = 'info' | 'conf' | 'succ' | 'error' | 'warn';

export interface DialogData {
  token: MsgToken;
  header: string;
  content: string;
  posAnsMsg: string;
  negAnsMsg: string;
  delay?: number;
  initialFocus?: 1 | 2 | 3;
}

@Component({
  selector: 'app-dialog',
  standalone: true,
  imports: [CommonModule, NzModalModule, NzButtonModule, NzIconModule],
  templateUrl: './dialog.html',
  styleUrl: './dialog.scss',
})
export class Dialog implements OnInit, OnDestroy {
  readonly dlgData = inject(NZ_MODAL_DATA) as DialogData;

  private autoCloseTimer: any;
  private modalRef = inject(NzModalRef);
  // private modal = inject(NzModalService);
  private iconService = inject(NzIconService);

  constructor() {
    this.iconService.addIcon(
      // InfoCircleOutline,
      // QuestionCircleOutline,
      // CheckCircleOutline,
      // CloseCircleOutline,
      // ExclamationCircleOutline
      InfoCircleTwoTone,
      QuestionCircleTwoTone,
      CheckCircleTwoTone,
      CloseCircleTwoTone,
      ExclamationCircleTwoTone
    );
  }

  ngOnInit(): void {
    const d = this.dlgData;

    // console.log('>===>> Dialog data:', JSON.stringify(d));

    if (!d.delay) d.delay = 5000;
    if (d.token === 'info' || d.token === 'succ' || d.token === 'warn') {
      this.autoCloseTimer = setTimeout(() => {
        this.modalRef.destroy();
      }, d.delay);
    }
  }

  ngOnDestroy(): void {
    this.clearAutoCloseTimer();
  }

  onNoClick(): void {
    this.clearAutoCloseTimer();
    this.modalRef.destroy(false);
  }

  onYesClick(): void {
    this.clearAutoCloseTimer();
    this.modalRef.destroy(true);
  }

  private clearAutoCloseTimer(): void {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }
  }



  getIconName(): string {
    switch (this.dlgData.token) {
      case 'info':
        return 'info-circle';
      case 'conf':
        return 'question-circle';
      case 'succ':
        return 'check-circle';
      case 'error':
        return 'close-circle';
      case 'warn':
        return 'exclamation-circle';
      default:
        return 'info-circle';
    }
  }

  getIconColor(): string {
    switch (this.dlgData.token) {
      case 'info':
        return '#1890ff';
      case 'conf':
        return '#faad14';
      case 'succ':
        return '#52c41a';
      case 'error':
        return '#ff4d4f';
      case 'warn':
        return '#fa8c16';
      default:
        return '#1890ff';
    }
  }

  getTokenClass(): string {
    return `${this.dlgData.token}-dialog`;
  }

  getButtonClass(type: 'positive' | 'negative'): string {
    return `${type}-${this.dlgData.token}`;
  }
}
