import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { Paginated } from '../common/dto/pagination-query.dto';
// DTO classes must be value imports: ValidationPipe reads them from decorator metadata.
import { CreateQuizDto } from './dto/create-quiz.dto';
import { ListQuizzesQueryDto } from './dto/list-quizzes-query.dto';
import { QuizIdParamDto } from './dto/quiz-id-param.dto';
import type { PublicQuizDetail, QuizSummary } from './quiz.selects';
import { QuizzesService } from './quizzes.service';

@Controller('quizzes')
export class QuizzesController {
  constructor(private readonly quizzes: QuizzesService) {}

  @Post()
  create(@Body() dto: CreateQuizDto): Promise<PublicQuizDetail> {
    return this.quizzes.create(dto);
  }

  @Get()
  list(@Query() query: ListQuizzesQueryDto): Promise<Paginated<QuizSummary>> {
    return this.quizzes.list(query);
  }

  @Get(':id')
  findOne(@Param() params: QuizIdParamDto): Promise<PublicQuizDetail> {
    return this.quizzes.findById(params.id);
  }
}
