import { Component, inject } from '@angular/core';
import { FormGroup, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { Articlebasicscraper  } from '../services/articlebasicscraper';
 // Adjust the import path as necessary


@Component({
  selector: 'app-article',
  imports: [
    ReactiveFormsModule, 
    NzFormModule,
    NzInputModule,
    NzCheckboxModule,
    NzButtonModule,
  ],
  templateUrl: './article.html',
  styleUrl: './article.scss'
})
export class Article {

  private fb = inject(NonNullableFormBuilder);
  validateForm!: FormGroup;
  
  private scrapper = inject(Articlebasicscraper);

  ngOnInit(): void {
    this.validateForm = this.fb.group({
    username: this.fb.control('', [Validators.required]),
    password: this.fb.control('', [Validators.required]),
    remember: this.fb.control(true)
  });
  }



  submitForm(): void {
    if (this.validateForm.valid) {
      // console.log('submit', this.validateForm.value);
      let url="https://medium.com/javascript-in-plain-english/stop-struggling-with-angular-routes-the-complete-data-passing-handbook-with-live-examples-b53b077dd5af?source=home_for_you---------2-98--------------------25c5297b_3529_4abd_8f5d_cb66cab38e6e-------15-------";
      console.log('Submitted URL: ', url);
      this.runScraper(url);

    } else {
      Object.values(this.validateForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
    }
  }



async runScraper(url: string): Promise<void> {
  let loading = true;
  let result = null;

  try {
    const response = await this.scrapper.scrapeArticle(url);

    if (response.success) {
      console.log('Scraper data:', response.data);
      result = response.data;
    } else {
      console.error('Scraper error:', response.error);
      result = { error: response.error };
    }
  } catch (err) {
    console.error('Unexpected error:', err);
    result = { error: err };
  } finally {
    loading = false;
  }
}



}
