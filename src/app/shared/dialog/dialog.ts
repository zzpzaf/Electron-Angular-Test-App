import { AfterViewInit, Component, ElementRef, OnInit, OnDestroy, ViewChild, inject } from '@angular/core';
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
export class Dialog implements OnInit, OnDestroy, AfterViewInit {
  readonly dlgData = inject(NZ_MODAL_DATA) as DialogData;

  @ViewChild('dialogRoot', { read: ElementRef })
  private dialogRoot?: ElementRef<HTMLElement>;
  @ViewChild('positiveBtn', { read: ElementRef })
  private positiveBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('negativeBtn', { read: ElementRef })
  private negativeBtn?: ElementRef<HTMLButtonElement>;

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

    
    if (d.token === 'info' || d.token === 'succ' || d.token === 'warn') {
      if (!d.delay) d.delay = 5000;
      this.autoCloseTimer = setTimeout(() => {
        this.modalRef.destroy();
      }, d.delay);
    }
  }

  ngAfterViewInit(): void {
    // Wait for modal content to be attached/painted before moving focus.
    setTimeout(() => this.applyInitialFocus(), 0);
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

  private applyInitialFocus(): void {
    const focusTarget = this.dlgData.initialFocus;
    if (!focusTarget) {
      return;
    }

    if (focusTarget === 1 && this.positiveBtn?.nativeElement) {
      this.positiveBtn.nativeElement.focus();
      return;
    }

    if (focusTarget === 2 && this.negativeBtn?.nativeElement) {
      this.negativeBtn.nativeElement.focus();
      return;
    }

    if (focusTarget === 3 && this.dialogRoot?.nativeElement) {
      this.dialogRoot.nativeElement.focus();
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
