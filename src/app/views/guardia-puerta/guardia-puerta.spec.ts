import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GuardiaPuerta } from './guardia-puerta';

describe('GuardiaPuerta', () => {
  let component: GuardiaPuerta;
  let fixture: ComponentFixture<GuardiaPuerta>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GuardiaPuerta],
    }).compileComponents();

    fixture = TestBed.createComponent(GuardiaPuerta);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
