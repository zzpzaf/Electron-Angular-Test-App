import { inject, Injectable } from '@angular/core';
import { NzModalService } from 'ng-zorro-antd/modal';
import { Dialog, DialogData } from '../dialog/dialog';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class DlgService {
  private modal = inject(NzModalService);
  // constructor(private modal: NzModalService) {}
  constructor() {}

  open(dlgData: DialogData): Observable<boolean | undefined> {
    const modalRef = this.modal.create({
      nzContent: Dialog,
      nzData: dlgData, // passes to NZ_MODAL_DATA inside Dialog
      nzFooter: null,
      nzClosable: false,
      nzMaskClosable: false,
      nzWidth: 400,
    });

    return modalRef.afterClose as Observable<boolean | undefined>;
  }

  popup(dialogData: DialogData) {
    return this.open(dialogData);
  }

  // OPTIONALLY we can also use the following 'dedicated functions:'
  // -------------------------------------------------------------------------
  // confirm(header: string, content: string, posAnsMsg = 'Yes', negAnsMsg = 'No', delay?: number) {
  //   return this.open({ token: 'conf', header, content, posAnsMsg, negAnsMsg, delay });
  // }

  // info(header: string, content: string, posAnsMsg = 'OK', delay?: number) {
  //   return this.open({ token: 'info', header, content, posAnsMsg, negAnsMsg: '', delay });
  // }

  // success(header: string, content: string, posAnsMsg = 'OK', delay?: number) {
  //   return this.open({ token: 'succ', header, content, posAnsMsg, negAnsMsg: '', delay });
  // }

  // error(header: string, content: string, posAnsMsg = 'OK', delay?: number) {
  //   return this.open({ token: 'error', header, content, posAnsMsg, negAnsMsg: '', delay });
  // }

  // warning(header: string, content: string, posAnsMsg = 'OK', delay?: number) {
  //   return this.open({ token: 'warn', header, content, posAnsMsg, negAnsMsg: '', delay });
  // }
}
